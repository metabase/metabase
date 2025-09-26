import { useEffect, useRef, useState } from "react";
import { keymap } from "@codemirror/view";
import { push } from "react-router-redux";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { skipToken } from "metabase/api";
import { CodeMirror } from "metabase/common/components/CodeMirror";
import { color } from "metabase/lib/colors";
import { useDispatch } from "metabase/lib/redux";
import { language } from "metabase/query_builder/components/NativeQueryEditor/CodeMirrorEditor/language";
import { Box, Text } from "metabase/ui";
import { useGetTransformQuery } from "metabase-enterprise/api";
import { t } from "ttag";

import {
  BenchPanel,
  TransformEntitiesList,
  TransformDetails,
  QueryPreview,
  TransformExecutionCard,
  CollectionsCard,
} from "./components";
import styles from "./BenchApp.module.css";
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

  const { data: selectedTransform } = useGetTransformQuery(transformId ?? skipToken);

  const [code, setCode] = useState(`-- ${t`Welcome to the Metabase Bench`} // eslint-disable-line no-literal-metabase-strings -- This string only shows for admins.
-- ${t`This is your SQL editor for transform development`}

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
    if (selectedTransform?.source?.query &&
        selectedTransform.source.query.type === 'native' &&
        'native' in selectedTransform.source.query &&
        selectedTransform.source.query.native?.query) {
      setCode(selectedTransform.source.query.native.query);
    } else if (!transformId) {
      // Reset to welcome message when no transform is selected
      setCode(`-- ${t`Welcome to the Metabase Bench`} // eslint-disable-line no-literal-metabase-strings -- This string only shows for admins.
-- ${t`This is your SQL editor for transform development`}

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

        {/* Center Panel - Code Editor with nested Preview */}
        <Panel defaultSize={60} minSize={30}>
          <Box h="100%" p="md">
            <Box
              h="100%"
              p="md"
              style={{
                backgroundColor: "var(--mb-color-bg-white)",
                border: "1px solid var(--mb-color-border)",
                borderRadius: "8px",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Box mb="md">
                    <Text fw={500}>
                      {selectedTransform
                        ? selectedTransform.name
                        : t`SQL Editor`}
                    </Text>
                    {selectedTransform && (
                      <Text size="sm">
                        {t`Target`}:{" "}
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

              {/* Nested Query Preview Card */}
              <Box
                mt="md"
                style={{
                  backgroundColor: "var(--mb-color-bg-white)",
                  border: "1px solid var(--mb-color-border)",
                  borderRadius: "8px",
                  boxShadow: `0 2px 8px ${color("shadow")}`,
                  maxHeight: "40vh",
                  minHeight: "200px",
                }}
              >
                <QueryPreview
                  ref={queryPreviewRef}
                  query={code}
                  databaseId={selectedTransform?.source?.query?.database}
                />
              </Box>
            </Box>
          </Box>
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
            <Box
              style={{
                height: "100%",
                padding: "16px",
                overflow: "auto",
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
                <Text size="xs">{t`Lines`}: {code.split("\n").length}</Text>
                <Text size="xs">{t`Characters`}: {code.length}</Text>
              </Box>
            </Box>
          </Box>
        </Panel>
      </PanelGroup>
    </Box>
  );
}
