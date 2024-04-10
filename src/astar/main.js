import Delaunator from "https://cdn.skypack.dev/delaunator@5.0.0";
import { Grid } from "./grid.js";
import { Graph } from "./graph.js";
import { Dijkstra } from "./dijkstra.js";
// import Delaunator from "delaunator";
window.addEventListener("load", () => {
  const canvas = document.querySelector("#grid");
  // define what context we are working in
  /** @type {CanvasRenderingContext2D} */
  const ctx = canvas.getContext("2d");

  // customizable: canvas.height, canvas.width, gridHeight, gridWidth
  canvas.height = 1000;
  canvas.width = 1000;

  const gridHeight = 20; // cells on y-axis
  const gridWidth = 20; // cells on x-axis

  const cellDim = canvas.height / gridHeight;

  let graph = null; // Graph Representation of node-midpoints and triangle-centroids and the respective connections

  let nodeCoordinates = [];
  let edgeConnections = [];

  let nodeInput = document.getElementById("nodeInput").value;
  let edgeInput = document.getElementById("edgeInput").value;

  let graphEdges = []; // list of edges from which I will extract the adjacency list
  let triangleMesh = []; // list of objects with all important triangle nodes for one triangle and their respective coordinates (includes: vertices (corner points) and centroids of a single triangle)
  let nodeMidoints = [];
  let centroids = [];
  let dijkstra = null;

  let grid = null;
  let paths = []; // shortest paths

  // Triangulation Canvas Layer
  const triangleCanvas = document.querySelector("#layer1");
  const ctx2 = triangleCanvas.getContext("2d");
  triangleCanvas.height = 1000;
  triangleCanvas.width = 1000;

  document.getElementById("triangleMeshBtn").addEventListener("click", () => drawDelaunayTriangles(ctx2));

  // get state and edge configuration from input
  document.getElementById("updateButton").addEventListener("click", updateGraph);

  // call path finding meethod
  document.getElementById("findPathBtn").addEventListener("click", findPathDual);

  ///// popup button config
  const popupBtn = document.getElementById("popupBtn");
  const popup = document.getElementById("popup");
  const closeBtn = document.getElementById("closeBtn");

  // When the button is clicked, show the popup
  popupBtn.addEventListener("click", function () {
    popup.style.display = "block";
  });

  // When the close button is clicked, hide the popup
  closeBtn.addEventListener("click", function () {
    popup.style.display = "none";
  });

  // When the user clicks anywhere outside of the popup, close it
  window.addEventListener("click", function (event) {
    if (event.target === popup) {
      popup.style.display = "none";
    }
  });
  ///// end of popup button config

  function updateGraph() {
    nodeInput = document.getElementById("nodeInput").value;
    edgeInput = document.getElementById("edgeInput").value;
    if (nodeInput) processNodeInput(nodeInput);
    if (edgeInput) applyUserConnections(nodeCoordinates, edgeInput); // get Edge-Connection configs from user input

    grid = new Grid(ctx, gridWidth, gridHeight, nodeCoordinates, canvas.height); // Create the grid
    redrawGraph(nodeCoordinates); // draw nodes
  }

  function drawDelaunayTriangles(ctx) {
    nodeInput = document.getElementById("nodeInput").value;
    let points = processNodeInputForTriangulation(nodeInput);
    const delaunay = Delaunator.from(points);
    let triangles = delaunay.triangles;
    let triangleCoordinates = [];
    for (let i = 0; i < triangles.length; i += 3) {
      triangleCoordinates.push([points[triangles[i]], points[triangles[i + 1]], points[triangles[i + 2]]]);
    }

    ctx.globalAlpha = 0.5;
    triangleCoordinates.forEach((t) => {
      ctx.beginPath();
      ctx.moveTo(t[0][0], t[0][1]);
      ctx.lineTo(t[1][0], t[1][1]);
      ctx.lineTo(t[2][0], t[2][1]);
      ctx.closePath();
      ctx.fillStyle = getRandomColor();
      ctx.fill();

      const centroid = calculateCentroid(t[0][0], t[0][1], t[1][0], t[1][1], t[2][0], t[2][1]);
      centroids.push(centroid);

      const triangleVertices = [
        { x: t[0][0], y: t[0][1] },
        { x: t[1][0], y: t[1][1] },
        { x: t[2][0], y: t[2][1] },
      ];

      // add triangle vertices and triangle centroids to triangleMesh array
      triangleMesh.push({ centroid: centroid, triangleVertices: triangleVertices });

      const radius = 5;
      ctx.beginPath();
      ctx.arc(centroid.x, centroid.y, radius, 0, Math.PI * 2); // Arc centered at (x, y) with radius
      ctx.fillStyle = "red"; // Fill color
      ctx.fill(); // Fill the circle
    });

    // convex hull of the points
    let hull = delaunay.hull;
    let hullCoordiantes = [];

    for (let i = 0; i < hull.length; i++) {
      hullCoordiantes.push(points[hull[i]]);
    }
    ctx.beginPath();
    ctx.moveTo(hullCoordiantes[0][0], hullCoordiantes[0][1]);

    hullCoordiantes.forEach((h) => {
      ctx.lineTo(h[0], h[1]);
    });
    ctx.closePath();
    ctx.strokeStyle = "red";
    ctx.stroke();
  }

  // New approach OVERVIEW:
  // Retrieve the data
  //
  // Represent data as nodes and centroids as a connected graph data structure, adjacency list (REPRESENT AS GRAPH)
  //
  // Find shortest path on that graph (with Dijkstra or A* idk)
  //
  // Then perform Post processing
  // start with the simple connections between 2 nodes, where only a quadratic bezier curve is needed
  // and where the path only goes through one control-point/centroid
  //
  // and then after that works use a series of either quadratic or bezier curves (for obstacles aka other nodes in the path of the edge)
  // to find the path going through multiple control-points/centroid

  function findPathDual() {
    // Retrieve data to Define the connections between nodes (edges) based on rules:
    // Rules:
    // #1 nodeMidpoints are only connected to the nearest centroids (how maybe by checking the delauney triangles that go out of a nodeMidoint and determining them that way)
    // #2 centroids are connected to nearest nodeMidpoints as well as other nearest centroids
    // #3 edges between centroids cannot cross other edges

    // 1. Connect nodeMidpoints to centroids:
    // triangle-Vertices are all nodeMidpoints, so I can connect the triangle vertices of a single trianlge to the centroid of that trianlge
    triangleMesh.forEach((triangle) => {
      triangle.triangleVertices.forEach((vertex) => {
        graphEdges.push([vertex, triangle.centroid]);
      });
    });

    // 2. Connect centroids to neighbouring (& only neighbouring) centroids
    // => edges between centroids can only be between centroids of exactly neighbouring dealuney triangles
    // neighbouring triangles could be determined if they share an edge (the 2 vertices of that edge), because then they have to be neighbouring in that case

    console.log(triangleMesh);

    // areTrianglesNeighboring(triangleA, triangleB)

    // Find neighbors for each triangle in the mesh
    const triangleNeighbors = findNeighborsForMesh(triangleMesh);

    // Example usage:
    triangleNeighbors.forEach((neighbors, index) => {
      console.log(`Neighbors of Triangle ${index}:`, neighbors);
      //    graphEdges.push([vertex, triangle.centroid]);
    });

    // 2. Draw edges for visualization
    graphEdges.forEach((edge) => {
      drawLine(ctx2, edge[0], edge[1]);
    });

    ///////////////////////
    graph = new Graph(ctx, nodeMidoints, centroids, graphEdges);

    dijkstra = new Dijkstra();
    paths = dijkstra.findPath(graph);

    // POST-PROCESSING
    // edgeConnections.map((edge))
    let startNode = edgeConnections[0].startNode;
    let targetNode = edgeConnections[0].targetNode;

    edgeConnections.map((edge) => {
      // ACTUALLY I DONT NEED TO CARE ABOUT THE CELLS AT ALL ANYMORE
      // THEY'RE JUST THERE FOR THE PREVIOUS APPROACH
      // TODO: Post-processing for rendering the edge:
      // compute what Side I should render the starting-point of the bezier curve from
      // and determine the position on that side by the set standards (and then calculate using dimensions of the node)
      // ctx2.beginPath();
      // ctx2.moveTo(startNode.x, startNode.y); // Move to the starting point
      // ctx2.lineTo(targetNode.x, targetNode.y); // Draw a line to the ending point
      // ctx2.strokeStyle = "red"; // Set the color of the edge
      // ctx2.lineWidth = 1; // Set the width of the edge
      // ctx2.stroke();
    });
  }

  function specifyDockingPoints(startNode, targetNode) {
    // this is part of post-processing
    // TODO: determine starting coordinates of the edge for the startingNode and determine end coordinates for the endNode
    // need to set standards, like on corners or in the middle of one side of the node

    // TODO:
    // get property of node to know: how many edges are going out of this node
    // then set standards for what cells of a node to choose depending
    // on the length of the side of the particular node

    console.log(startNode, targetNode);

    // return { startPos, targetPos };
  }

  // Function to find neighboring triangles for each triangle
  function findNeighborsForMesh(mesh) {
    const neighbors = [];
    const numTriangles = mesh.length;
    // Iterate over each triangle
    for (let i = 0; i < numTriangles; i++) {
      const currentTriangle = mesh[i];
      const currentTriangleNeighbors = [];
      // Check against every other triangle
      for (let j = 0; j < numTriangles; j++) {
        if (i !== j && areTrianglesNeighboring(currentTriangle, mesh[j])) {
          currentTriangleNeighbors.push(mesh[j]); // Add neighboring triangle object
        }
      }
      neighbors.push(currentTriangleNeighbors); // Add neighbors of current triangle to the list
    }
    return neighbors;
  }

  // Function to check if two triangles are neighboring
  function areTrianglesNeighboring(triangleA, triangleB) {
    // Iterate over each edge of triangleA
    for (let i = 0; i < 3; i++) {
      const edge = [triangleA.triangleVertices[i], triangleA.triangleVertices[(i + 1) % 3]]; // Get current edge
      // Check if triangleB shares the same edge
      if (
        triangleB.triangleVertices.some((vertex) => edge[0].x === vertex.x && edge[0].y === vertex.y) &&
        triangleB.triangleVertices.some((vertex) => edge[1].x === vertex.x && edge[1].y === vertex.y)
      ) {
        return true; // Found a common edge, triangles are neighbors
      }
    }
    return false; // No common edge found
  }

  function processNodeInput(nodeInput) {
    nodeCoordinates = nodeInput.split(";").map((entry) => {
      // x = x-axis coordinate of the rectangle's starting point, in pixels. (top left corner of node) // y = y-axis coordinate of the rectangle's starting point, in pixels. (top left corner of node) // width = rectangle's width. Positive values are to the right, and negative to the left. // height = rectangle's height. Positive values are down, and negative are up.
      let [x, y, width, height] = entry.split(",").map(Number);
      if (isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) {
        throw new Error("Invalid node input");
      }
      const midpoint = { x: x + width / 2, y: y + height / 2 };
      nodeMidoints.push(midpoint);
      return { x, y, width, height };
    });
  }

  function processNodeInputForTriangulation(nodeInput) {
    return nodeInput.split(";").map((entry) => {
      let [x, y, width, height] = entry.split(",").map(Number);
      if (isNaN(x) || isNaN(y)) {
        throw new Error("Invalid node input");
      }
      return [x + width / 2, y + height / 2]; // get center/midpoint of the node (rectangle/square shape)
    });
  }

  function drawLine(ctx, start, end) {
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.strokeStyle = "blue";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Function to parse user input and apply connections
  function applyUserConnections(nodes, edgeInput) {
    // Split the user input by semicolons to separate individual connections
    let connections = edgeInput.split(";").map((connection) => connection.trim());

    // Iterate over each connection
    connections.forEach((connection) => {
      // Extract x and y coordinates of the two nodes from the connection string
      let [x1, y1, x2, y2] = connection.match(/\d+/g).map(Number);

      // Find the nodes in the nodes array using their coordinates
      let startNode = nodes.find((node) => node.x === x1 && node.y === y1);
      let targetNode = nodes.find((node) => node.x === x2 && node.y === y2);
      // Check if both nodes are found
      if (startNode && targetNode) {
        // Apply logic to connect nodes (e.g., draw a line between them)
        console.log("Connecting nodes:", startNode, "and", targetNode);
        edgeConnections.push({ startNode, targetNode });
      } else {
        // Display an error message if nodes cannot be found
        console.log("Invalid node coordinates:", connection);
      }
    });
  }

  // Function to draw the graph
  function redrawGraph(nodes) {
    // ctx.clearRect(0, 0, canvas.width, canvas.height);
    nodes.forEach((node) => drawNode(node));

    // edges.forEach((edge, index) => {}); // draw edges
  }

  function drawNode(node) {
    const { x, y, width, height } = node;
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, [15]);
    ctx.stroke();
  }

  function getRandomColor() {
    const color = "#" + Math.floor(Math.random() * 16777215).toString(16); // 16777215 is equivalent to FFFFFF in hexadecimal
    return color;
  }

  function calculateCentroid(x1, y1, x2, y2, x3, y3) {
    const Cx = (x1 + x2 + x3) / 3;
    const Cy = (y1 + y2 + y3) / 3;
    // Example usage:
    // const centroid = calculateCentroid(0, 0, 3, 0, 0, 4);
    // console.log("Centroid:", centroid); // Output: { Cx: 1, Cy: 1.333 }
    return { x: Cx, y: Cy };
  }
});