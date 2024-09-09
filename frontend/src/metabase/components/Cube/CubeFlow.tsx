import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactFlow, {
  useNodesState,
  useEdgesState,
  addEdge,
  Background,
  Controls,
  MarkerType,
  Edge,
  ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { Flex, Group, Title } from "metabase/ui";
import { t } from "ttag";
import NoResults from "assets/img/no_results.svg";
import {
  createGraphData,
  createNewGraphData,
  CubeData,
  CubeFlowProps,
  extractCubeName,
  extractSQLInfo,
  extractTableName,
  FieldData,
  MapData,
  newExtractAllJoins,
} from "./utils";
import CustomNode from "./CubeNode";
import { getLayoutedElements } from "./LayoutedElements";
import {
  skipToken,
  useGetCubeDataQuery,
  useListDatabasesQuery,
} from "metabase/api";
import LoadingAndErrorWrapper from "../LoadingAndErrorWrapper";
import {
  BrowseContainer,
  BrowseHeader,
  BrowseSection,
  CenteredEmptyState,
} from "metabase/browse/components/BrowseContainer.styled";
import { Box } from "@mantine/core";
import { GetCubeDataRequest } from "metabase-types/api";

const nodeTypes = {
  custom: CustomNode,
};

const CubeFlow = () => {
  const {
    data: dbData,
    isLoading: dbLoading,
    error: dbError,
  } = useListDatabasesQuery();
  const databases = dbData?.data;
  const companyName = useMemo(() => {
    if (databases) {
      const cubeDatabase = databases.find(
        database => database.is_cube === true,
      );
      return cubeDatabase ? cubeDatabase.company_name : "";
    }
    return "";
  }, [databases]);

  const { data, isLoading, error } = useGetCubeDataQuery(
    companyName ? { companyName } : skipToken,
  );
  const [showDefinition, setShowDefinition] = useState<boolean>(false);
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);

  const cubes = data as { content: string }[];

  const tableGroups: { [key: string]: FieldData[] } = {};
  if (error) {
    return <LoadingAndErrorWrapper error />;
  }

  if (!cubes && isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (!cubes?.length) {
    return (
      <CenteredEmptyState
        title={<Box mb=".5rem">{t`No databases here yet`}</Box>}
        illustrationElement={
          <Box mb=".5rem">
            <img src={NoResults} />
          </Box>
        }
      />
    );
  }

  const cubesArr: any = cubes.map(cube => cube.content);
  let tableNameArr: string[] = [];
  let cubeNameArr: string[] = [];
  cubes.forEach(cube => {
    const cubeName = extractCubeName(cube.content);
    const tableName = extractCubeName(cube.content);
    tableNameArr.push(tableName);
    cubeNameArr.push(cubeName);
    const cubeInfo = extractSQLInfo(cube.content);
  });
  const newJoinFromArr = newExtractAllJoins(cubesArr);

  const extractedKeys = Object.keys(newJoinFromArr);
  const extractedValues = Object.values(newJoinFromArr);
  const modifiedExtractedVal = () => {
    const result = extractedValues.map((items: string[], index: number) => {
      const cubeName = extractedKeys[index];
      return items.map((item: string) => {
        return item.replace("${CUBE}", `\${${cubeName}}`);
      });
    });

    return result;
  };
  const modifiedValues = modifiedExtractedVal();

  const getTableName = (cubeName: string) => {
    let idx = 0;
    for (let i = 0; i < cubeNameArr.length; i++) {
      if (cubeName === cubeNameArr[i]) {
        idx = i;
      }
    }
    return tableNameArr[idx];
  };

  const extractingField = (arr: any[]): FieldData[] => {
    const resultMap: { [key: string]: FieldData } = {};

    const addField = (table: string, field: string, type?: string) => {
      const id = `${table}-${field}`;
      if (!resultMap[id]) {
        resultMap[id] = { id, table, field, type };
      }
    };

    arr.forEach((items: string[], index: number) => {
      const cubeName = extractedKeys[index];

      items.forEach((item: string) => {
        const sourceMatch = item.match(/\${(\w+)}\.(\w+)/);
        const targetMatch = item.match(/=\s*\${(\w+)}\.(\w+)/);

        if (sourceMatch) {
          const [, sourceCube, sourceField] = sourceMatch;
          addField(sourceCube, sourceField, "source");
        }

        if (targetMatch) {
          const [, targetCube, targetField] = targetMatch;
          const targetTableName = getTableName(targetCube);
          addField(targetTableName, targetField, "target");
        }
      });
    });

    tableNameArr.forEach(table => {
      if (!Object.values(resultMap).some(field => field.table === table)) {
        addField(table, "id");
      }
    });

    return Object.values(resultMap);
  };

  const extractField = extractingField(modifiedValues);

  const createData = (arr: any[]): MapData[] => {
    const resultMap: { [key: string]: MapData } = {};

    const addField = (
      sourceCube: string,
      sourceField: string,
      targetTable: string,
      targetField: string,
    ) => {
      const id = `${sourceCube}-${targetTable}`;
      if (!resultMap[id]) {
        resultMap[id] = {
          id,
          sourceCube,
          sourceField,
          targetTable,
          targetField,
        };
      }
    };
    arr.forEach((items: string[], index: number) => {
      const cubeName = extractedKeys[index];

      items.forEach((item: string) => {
        const sourceMatch = item.match(/\${(\w+)}\.(\w+)/);
        const targetMatch = item.match(/=\s*\${(\w+)}\.(\w+)/);

        if (sourceMatch && targetMatch) {
          const [, sourceCube, sourceField] = sourceMatch;
          const [, targetCube, targetField] = targetMatch;
          const targetTableName = getTableName(targetCube);

          addField(sourceCube, sourceField, targetTableName, targetField);
        }
      });
    });

    return Object.values(resultMap);
  };

  const newField = createData(modifiedValues);

  extractField.forEach(field => {
    if (!tableGroups[field.table]) {
      tableGroups[field.table] = [];
    }
    tableGroups[field.table].push(field);
  });

  const cubeData: CubeData = {};

  cubes.forEach(cube => {
    const cubeName = extractCubeName(cube.content);
    const cubeInfo = extractSQLInfo(cube.content);

    cubeData[cubeName] = {
      fields: cubeInfo.fields,
    };
  });

  const oldGraphData = createGraphData(
    tableGroups,
    cubeData,
    tableNameArr,
    cubeNameArr,
  );
  const graphData = createNewGraphData(
    tableGroups,
    cubeData,
    tableNameArr,
    cubeNameArr,
    newField,
  );
  const [hoveredNode, setHoveredNode] = useState(null);
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const nodes = graphData.nodes.map((node: any) => ({
      id: node.id,
      type: "custom",
      data: {
        label: node.label,
        fields: node.fields.map((field: any) => ({
          ...field,
          hasHandle: field.type === "source" || field.type === "target",
        })),
        cubeInfo: node.cubeInfo,
        showDefinition: showDefinition,
      },
      position: { x: 0, y: 0 },
    }));
    const edges = graphData.edges.map((edge: any, index: any) => ({
      id: `e${index}`,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: "default",
      animated: true,
      style: { stroke: "#587330" },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#587330",
      },
    }));

    return getLayoutedElements(nodes, edges, "LR", showDefinition);
  }, [showDefinition]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const onConnect = useCallback(
    (params: any) =>
      setEdges(eds =>
        addEdge(
          {
            ...params,
            type: "default",
            animated: true,
            style: { stroke: "#587330" },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#587330",
            },
          },
          eds,
        ),
      ),
    [setEdges],
  );
  const onNodeMouseEnter = useCallback((event: any, node: any) => {
    setHoveredNode(node.id);
  }, []);
  const onNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, []);
  const elementsToHighlight = useMemo(() => {
    if (!hoveredNode) return new Set();
    const connectedEdges = edges.filter(
      e => e.source === hoveredNode || e.target === hoveredNode,
    );
    const connectedNodes = new Set(
      connectedEdges.flatMap(e => [e.source, e.target]),
    );
    return connectedNodes;
  }, [hoveredNode, edges]);
  const highlightedNodes = useMemo(
    () =>
      nodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          isConnected: elementsToHighlight.has(node.id),
        },
      })),
    [nodes, elementsToHighlight],
  );
  const highlightedEdges = useMemo(
    () =>
      edges.map(edge => {
        const isHighlighted =
          edge.source === hoveredNode || edge.target === hoveredNode;
        const highlightColor = "#00FF00"; // Green
        const defaultColor = "#587330";

        return {
          ...edge,
          style: {
            ...edge.style,
            stroke: isHighlighted ? highlightColor : defaultColor,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed, // Or whichever marker type you're using
            color: isHighlighted ? highlightColor : defaultColor,
          },
        } as Edge;
      }),
    [edges, hoveredNode],
  );

  const handleDefinition = useCallback(() => {
    setShowDefinition(prevShowDefinition => !prevShowDefinition);

    setNodes(prevNodes => {
      const updatedNodes = prevNodes.map(node => ({
        ...node,
        data: { ...node.data, showDefinition: !node.data.showDefinition },
      }));

      const { nodes: layoutedNodes, edges: layoutedEdges } =
        getLayoutedElements(updatedNodes, edges, "LR", !showDefinition);

      setEdges(layoutedEdges);

      setTimeout(() => {
        if (reactFlowInstanceRef.current) {
          reactFlowInstanceRef.current.fitView({ padding: 0.2, duration: 200 });
        }
      }, 50);

      return layoutedNodes;
    });
  }, [edges, showDefinition, setNodes, setEdges]);

  const onInit = useCallback((reactFlowInstance: ReactFlowInstance) => {
    reactFlowInstanceRef.current = reactFlowInstance;
    reactFlowInstance.fitView({ padding: 0.2 });
  }, []);

  return (
    <>
      <BrowseContainer>
        <BrowseHeader>
          <BrowseSection>
            <Flex
              w="100%"
              h="auto" // Adjust height if needed
              direction="column" // Changed to column
              justify="flex-start" // Align items at the start
              align="flex-start"
              gap="md"
            >
              <Title order={1} color="text-dark">
                <Group spacing="sm">{t`Data Map`}</Group>
              </Title>
            </Flex>
          </BrowseSection>
        </BrowseHeader>
        <div style={{ width: "80vw", height: "70vh", background: "#F9FBFC" }}>
          <ReactFlow
            nodes={highlightedNodes}
            edges={highlightedEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            onInit={onInit}
            fitView
            attributionPosition="bottom-left"
            nodeTypes={nodeTypes}
            defaultEdgeOptions={{
              type: "default",
              animated: true,
              style: { stroke: "#587330" },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: "#587330",
              },
            }}
          >
            <Background color="#555" gap={16} />
            <Controls />
          </ReactFlow>
          <div
            style={{
              position: "absolute",
              right: 60,
              top: 210,
              zIndex: 1000,
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <button
              style={{
                padding: "10px",
                backgroundColor: "#587330",
                color: "white",
                border: "none",
                borderRadius: "10px",
                cursor: "pointer",
              }}
              onClick={handleDefinition}
            >
              {showDefinition ? "Hide" : "Show"} Definition
            </button>
          </div>
        </div>
      </BrowseContainer>
    </>
  );
};
export default CubeFlow;
