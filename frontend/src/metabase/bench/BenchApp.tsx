import { Box, Text } from "metabase/ui";
import { CodeMirror } from "metabase/common/components/CodeMirror";
import { useState, useEffect } from "react";
import { language } from "metabase/query_builder/components/NativeQueryEditor/CodeMirrorEditor/language";
import { push } from "react-router-redux";
import { useDispatch } from "metabase/lib/redux";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useGetTransformQuery } from "metabase-enterprise/api";
import { skipToken } from "metabase/api";
import {
  BenchPanel,
  TransformEntitiesList,
  TransformDetails,
} from "./components";
import type { Transform } from "metabase-types/api";

interface BenchAppProps {
  params?: {
    transformId?: string;
  };
}

export function BenchApp({ params }: BenchAppProps) {
  const dispatch = useDispatch();
  const transformId = params?.transformId
    ? parseInt(params.transformId, 10)
    : undefined;

  const { data: selectedTransform, isLoading: isLoadingTransform } =
    useGetTransformQuery(transformId ?? skipToken);

  const [code, setCode] = useState(`-- Welcome to the Metabase Bench
-- This is your SQL editor for transform development

SELECT
  customer_id,
  COUNT(*) as order_count,
  SUM(total_amount) as total_spent
FROM orders
WHERE created_at >= '2024-01-01'
GROUP BY customer_id
ORDER BY total_spent DESC;`);

  // Update editor content when transform is loaded
  useEffect(() => {
    if (selectedTransform?.source?.query?.native?.query) {
      setCode(selectedTransform.source.query.native.query);
    } else if (!transformId) {
      // Reset to welcome message when no transform is selected
      setCode(`-- Welcome to the Metabase Bench
-- This is your SQL editor for transform development

SELECT
  customer_id,
  COUNT(*) as order_count,
  SUM(total_amount) as total_spent
FROM orders
WHERE created_at >= '2024-01-01'
GROUP BY customer_id
ORDER BY total_spent DESC;`);
    }
  }, [selectedTransform, transformId]);

  const handleTransformClick = (transform: Transform) => {
    dispatch(push(`/bench/transform/${transform.id}`));
  };

  return (
    <Box h="100vh" style={{ overflow: "hidden" }}>
      <PanelGroup direction="horizontal">
        {/* Left Panel - Transform Entities */}
        <Panel defaultSize={20} minSize={15} maxSize={35}>
          <BenchPanel title="Transform Entities" height="100%">
            <TransformEntitiesList
              selectedTransformId={transformId}
              onTransformClick={handleTransformClick}
            />
          </BenchPanel>
        </Panel>

        <PanelResizeHandle
          style={{
            width: "4px",
            backgroundColor: "var(--mantine-color-gray-3)",
            cursor: "col-resize",
            borderRadius: "2px",
            margin: "0 2px",
          }}
        />

        {/* Center Panel - Code Editor */}
        <Panel defaultSize={60} minSize={30}>
          <Box h="100%" style={{ display: "flex", flexDirection: "column" }}>
            <Box
              p="md"
              style={{
                borderBottom: "1px solid var(--mantine-color-gray-3)",
                backgroundColor: "var(--mantine-color-gray-0)",
              }}
            >
              <Text fw={500}>
                {selectedTransform ? selectedTransform.name : "SQL Editor"}
              </Text>
              {selectedTransform && (
                <Text size="sm" c="dimmed">
                  Target:{" "}
                  {selectedTransform.target.schema
                    ? `${selectedTransform.target.schema}.`
                    : ""}
                  {selectedTransform.target.name}
                </Text>
              )}
            </Box>
            <Box style={{ flex: 1, position: "relative" }}>
              <CodeMirror
                value={code}
                onChange={(value) => setCode(value)}
                height="100%"
                style={{
                  height: "100%",
                  fontSize: "14px",
                }}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  dropCursor: false,
                  allowMultipleSelections: false,
                }}
                extensions={language({ engine: "postgres" })}
                placeholder="Enter your SQL code here..."
              />
            </Box>
          </Box>
        </Panel>

        <PanelResizeHandle
          style={{
            width: "4px",
            backgroundColor: "var(--mantine-color-gray-3)",
            cursor: "col-resize",
            borderRadius: "2px",
            margin: "0 2px",
          }}
        />

        {/* Right Panel - Properties/Tools */}
        <Panel defaultSize={20} minSize={15} maxSize={35}>
          <BenchPanel title="Properties" height="100%">
            <TransformDetails transformId={transformId} />
            <Box
              p="sm"
              mt="md"
              style={{
                backgroundColor: "var(--mantine-color-gray-1)",
                borderRadius: "4px",
              }}
            >
              <Text size="xs">Lines: {code.split("\n").length}</Text>
              <Text size="xs">Characters: {code.length}</Text>
            </Box>
          </BenchPanel>
        </Panel>
      </PanelGroup>
    </Box>
  );
}
