import { Panel } from "@xyflow/react";
import { memo } from "react";
import { t } from "ttag";

import { AppSwitcher } from "metabase/nav/components/AppSwitcher";
import { Button, Group, Icon } from "metabase/ui";
import type { DatabaseId } from "metabase-types/api";

import S from "../../SchemaViewer.module.css";
import type { LayoutReason } from "../../hooks/useGraphLayout";
import type { SchemaViewerFlowNode } from "../../types";
import { SchemaViewerNodeSearch } from "../NodeSearch";
import { SchemaPickerInput } from "../SchemaPickerInput";

type SchemaViewerCanvasControlsProps = {
  databaseId: DatabaseId | undefined;
  schema: string | undefined;
  contextKey: string | null;
  /** Settled nodes: stable while a table is dragged. */
  nodes: SchemaViewerFlowNode[];
  selectedNodeId: string | null;
  pendingReason: LayoutReason | null;
  onSchemaChange: () => void;
  onResetLayout: () => void;
  onFocusNode: (nodeId: string) => void;
};

/**
 * The toolbar panels around the canvas. Memoized so dragging a table, which
 * re-renders the viewer every frame, doesn't re-render these Mantine controls.
 */
export const SchemaViewerCanvasControls = memo(
  function SchemaViewerCanvasControls({
    databaseId,
    schema,
    contextKey,
    nodes,
    selectedNodeId,
    pendingReason,
    onSchemaChange,
    onResetLayout,
    onFocusNode,
  }: SchemaViewerCanvasControlsProps) {
    return (
      <>
        <Panel className={S.entryInput} position="top-left">
          <Group gap="sm">
            <SchemaPickerInput
              databaseId={databaseId}
              schema={schema}
              onSchemaChange={onSchemaChange}
            />
            <SchemaViewerNodeSearch key={contextKey ?? ""} nodes={nodes} />
          </Group>
        </Panel>

        <Panel position="top-right">
          <AppSwitcher className={S.appSwitcher} />
        </Panel>

        {nodes.length > 0 && (
          <Panel position="bottom-left">
            <Group gap="sm">
              <Button
                bg="background_page-primary"
                leftSection={<Icon name="sparkles" />}
                loading={pendingReason === "auto-layout"}
                onClick={onResetLayout}
              >
                {t`Auto-layout`}
              </Button>
              {selectedNodeId != null && (
                <Button
                  bg="background_page-primary"
                  loading={pendingReason === "focus-node"}
                  onClick={() => onFocusNode(selectedNodeId)}
                >
                  {t`Focus node`}
                </Button>
              )}
            </Group>
          </Panel>
        )}
      </>
    );
  },
);
