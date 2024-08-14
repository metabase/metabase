
import dagre from "dagre";

export const getLayoutedElements = (nodes:any, edges:any, direction = "LR", showDefinition:boolean) => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: direction });
    nodes.forEach((node:any) => {
      const infoLength = Object.keys(node.data.cubeInfo.fields).length;
      const nodeHeight = showDefinition ? 36 + node.data.fields.length + infoLength * 35 : 36 + node.data.fields.length * 35;
      dagreGraph.setNode(node.id, {
        width: 172,
        height: nodeHeight ,
      });
    });
    edges.forEach((edge:any) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });
    dagre.layout(dagreGraph);
    const layoutedNodes = nodes.map((node:any) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - nodeWithPosition.width / 2,
          y: nodeWithPosition.y - nodeWithPosition.height / 2,
        },
      };
    });
    return { nodes: layoutedNodes, edges };
  };