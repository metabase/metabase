import { Box, Text } from "metabase/ui";
import { CodeMirror } from "metabase/common/components/CodeMirror";
import { useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { BenchPanel, TransformEntitiesList } from "./components";

export function BenchApp() {
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

  return (
    <Box h="100vh" style={{ overflow: "hidden" }}>
      <PanelGroup direction="horizontal">
        {/* Left Panel - Transform Entities */}
        <Panel defaultSize={20} minSize={15} maxSize={35}>
          <BenchPanel title="Transform Entities" height="100%">
            <TransformEntitiesList />
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
              <Text fw={500}>SQL Editor</Text>
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
            <Text size="sm" c="dimmed" mb="md">
              Query properties and metadata will appear here.
            </Text>
            <Box
              p="sm"
              style={{
                backgroundColor: "var(--mantine-color-gray-1)",
                borderRadius: "4px",
              }}
            >
              <Text size="xs" fw={500} mb="xs">
                Current Query Info
              </Text>
              <Text size="xs" c="dimmed">
                Lines: {code.split("\n").length}
              </Text>
              <Text size="xs" c="dimmed">
                Characters: {code.length}
              </Text>
            </Box>
          </BenchPanel>
        </Panel>
      </PanelGroup>
    </Box>
  );
}
