import { useState } from "react";
import { ResizableBox } from "react-resizable";
import { useWindowSize } from "react-use";
import { t } from "ttag";

import RunButtonWithTooltip from "metabase/query_builder/components/RunButtonWithTooltip";
import { Button, Flex, Icon, Stack, Tooltip } from "metabase/ui";

import { PythonEditor } from "../../PythonEditor";

import { ResizableBoxHandle } from "./ResizableBoxHandle";

type PythonEditorBodyProps = {
  disabled?: boolean;
  source: string;
  proposedSource?: string;
  isRunnable: boolean;
  isEditMode?: boolean;
  onChange: (source: string) => void;
  onRun?: () => void;
  onCancel?: () => void;
  isRunning?: boolean;
  isDirty?: boolean;
  tables?: Record<string, number>;
  withDebugger?: boolean;
  onAcceptProposed?: () => void;
  onRejectProposed?: () => void;
};

const EDITOR_HEIGHT = 400;
const HEADER_HEIGHT = 65 + 50; // Top bar height + transform header height
const PREVIEW_MAX_INITIAL_HEIGHT = 192;

export function PythonEditorBody({
  disabled,
  source,
  proposedSource,
  onChange,
  isRunnable,
  isEditMode,
  onRun,
  onCancel,
  isRunning,
  isDirty,
  withDebugger,
  onAcceptProposed,
  onRejectProposed,
}: PythonEditorBodyProps) {
  const [isResizing, setIsResizing] = useState(false);
  const editorHeight = useInitialEditorHeight(isEditMode);

  return (
    <ResizableBox
      axis="y"
      height={editorHeight}
      handle={<ResizableBoxHandle />}
      resizeHandles={!isEditMode || !withDebugger ? [] : ["s"]}
      style={isResizing ? undefined : { transition: "height 0.25s" }}
      onResizeStart={() => setIsResizing(true)}
      onResizeStop={() => setIsResizing(false)}
    >
      <Flex h="100%" align="end" bg="background-secondary" pos="relative">
        <PythonEditor
          value={source}
          proposedValue={proposedSource}
          onChange={onChange}
          withPandasCompletions
          readOnly={!isEditMode || disabled}
          data-testid="python-editor"
        />

        {isEditMode && (
          <Stack m="1rem" gap="md" mt="auto">
            {proposedSource && onRejectProposed && onAcceptProposed && (
              <>
                <Tooltip label={t`Accept proposed changes`} position="left">
                  <Button
                    data-testid="accept-proposed-changes-button"
                    variant="filled"
                    bg="success"
                    px="0"
                    w="2.5rem"
                    onClick={onAcceptProposed}
                  >
                    <Icon name="check" />
                  </Button>
                </Tooltip>
                <Tooltip label={t`Reject proposed changes`} position="left">
                  <Button
                    data-testid="reject-proposed-changes-button"
                    w="2.5rem"
                    px="0"
                    variant="filled"
                    bg="danger"
                    onClick={onRejectProposed}
                  >
                    <Icon name="close" />
                  </Button>
                </Tooltip>
              </>
            )}
            <RunButtonWithTooltip
              disabled={!isRunnable}
              isRunning={isRunning}
              isDirty={isDirty}
              onRun={onRun}
              onCancel={onCancel}
              getTooltip={() => t`Run Python script`}
            />
          </Stack>
        )}
      </Flex>
    </ResizableBox>
  );
}

function useInitialEditorHeight(isEditMode?: boolean) {
  const { height: windowHeight } = useWindowSize();
  const availableHeight = windowHeight - HEADER_HEIGHT;

  if (!isEditMode) {
    // When not in edit mode, we don't need to split the container to show the results panel on the bottom
    return availableHeight;
  }

  // Let's make the preview initial height be half of the available height at most
  const previewInitialHeight = Math.min(
    availableHeight / 2,
    PREVIEW_MAX_INITIAL_HEIGHT,
  );

  return Math.min(availableHeight - previewInitialHeight, EDITOR_HEIGHT);
}
