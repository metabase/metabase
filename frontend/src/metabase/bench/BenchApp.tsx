import { Box, Text, Tabs } from "metabase/ui";
import { CodeMirror } from "metabase/common/components/CodeMirror";
import { useState, useEffect, useRef } from "react";
import { keymap } from "@codemirror/view";
import { language } from "metabase/query_builder/components/NativeQueryEditor/CodeMirrorEditor/language";
import styles from "./BenchApp.module.css";
import { push } from "react-router-redux";
import { useDispatch } from "metabase/lib/redux";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useGetTransformQuery } from "metabase-enterprise/api";
import { skipToken } from "metabase/api";
import {
  BenchPanel,
  TransformEntitiesList,
  TransformDetails,
  QueryPreview,
  BenchMetabot,
  TransformExecutionCard,
  CollectionsCard,
} from "./components";
import type { Transform } from "metabase-types/api";

interface BenchAppProps {
  params?: {
    transformId?: string;
  };
}

export function BenchApp({ params }: BenchAppProps) {
  const dispatch = useDispatch();
  const queryPreviewRef = useRef<{ runQuery: () => void }>(null);
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

  const handleRunQuery = () => {
    queryPreviewRef.current?.runQuery();
  };

  return (
    <Box h="100vh" style={{ overflow: "hidden" }}>
      <PanelGroup direction="horizontal">
        {/* Left Panel - Transform Entities */}
        <Panel defaultSize={20} minSize={15} maxSize={35}>
          <BenchPanel title="Transforms" height="100%">
            <TransformEntitiesList
              selectedTransformId={transformId}
              onTransformClick={handleTransformClick}
            />
          </BenchPanel>
        </Panel>

        <PanelResizeHandle
          style={{
            width: "4px",
            cursor: "col-resize",
            borderRadius: "2px",
            margin: "0 2px",
          }}
        />

        {/* Center Panel - Code Editor and Preview */}
        <Panel defaultSize={60} minSize={30}>
          <PanelGroup direction="vertical">
            {/* Code Editor */}
            <Panel defaultSize={60} minSize={30}>
              <Box
                h="100%"
                style={{ display: "flex", flexDirection: "column" }}
              >
                <Box p="md">
                  <Text fw={500}>
                    {selectedTransform ? selectedTransform.name : "SQL Editor"}
                  </Text>
                  {selectedTransform && (
                    <Text size="sm">
                      Target:{" "}
                      {selectedTransform.target.schema
                        ? `${selectedTransform.target.schema}.`
                        : ""}
                      {selectedTransform.target.name}
                    </Text>
                  )}
                </Box>
                <Box
                  style={{ flex: 1, position: "relative" }}
                  className={styles.benchEditor}
                >
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
                    extensions={[
                      ...language({ engine: "postgres" }),
                      keymap.of([
                        {
                          key: "Mod-Enter",
                          run: () => {
                            handleRunQuery();
                            return true;
                          },
                        },
                      ]),
                    ]}
                    placeholder="Enter your SQL code here..."
                  />
                </Box>
              </Box>
            </Panel>

            <PanelResizeHandle
              style={{
                height: "4px",
                cursor: "row-resize",
                borderRadius: "2px",
                margin: "2px 0",
              }}
            />

            {/* Query Preview */}
            <Panel defaultSize={40} minSize={20}>
              <Box
                h="100%"
                style={{
                  borderRadius: "8px",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <QueryPreview
                  ref={queryPreviewRef}
                  query={code}
                  databaseId={selectedTransform?.source?.query?.database}
                />
              </Box>
            </Panel>
          </PanelGroup>
        </Panel>

        <PanelResizeHandle
          style={{
            width: "4px",
            cursor: "col-resize",
            borderRadius: "2px",
            margin: "0 2px",
          }}
        />

        {/* Right Panel - Properties/Tools */}
        <Panel defaultSize={20} minSize={15} maxSize={35}>
          <Box h="100%" style={{ display: "flex", flexDirection: "column" }}>
            <Tabs
              defaultValue="properties"
              style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Tabs.List>
                <Tabs.Tab value="properties">Properties</Tabs.Tab>
                <Tabs.Tab value="metabot">Metabot</Tabs.Tab>
              </Tabs.List>

              <Box style={{ flex: 1, overflow: "hidden" }}>
                <Tabs.Panel
                  value="properties"
                  style={{ height: "100%", padding: "16px", overflow: "auto" }}
                >
                  <Box
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                    }}
                  >
                    <TransformDetails transformId={transformId} />

                    <TransformExecutionCard transform={selectedTransform} />

                    <CollectionsCard transform={selectedTransform} />

                    <Box
                      p="sm"
                      style={{
                        borderRadius: "4px",
                      }}
                    >
                      <Text size="xs">Lines: {code.split("\n").length}</Text>
                      <Text size="xs">Characters: {code.length}</Text>
                    </Box>
                  </Box>
                </Tabs.Panel>

                <Tabs.Panel
                  value="metabot"
                  style={{ height: "100%", padding: 0 }}
                >
                  <BenchMetabot />
                </Tabs.Panel>
              </Box>
            </Tabs>
          </Box>
        </Panel>
      </PanelGroup>
    </Box>
  );
}
