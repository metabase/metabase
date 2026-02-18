import { useCallback, useMemo, useState } from "react";
import { ResizableBox } from "react-resizable";
import { push } from "react-router-redux";
import { useWindowSize } from "react-use";
import { t } from "ttag";

import { clickableTokens } from "metabase/common/components/CodeMirror";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { RunButtonWithTooltip } from "metabase/query_builder/components/RunButtonWithTooltip";
import { Button, Flex, Icon, Stack, Tooltip } from "metabase/ui";

import { SHARED_LIB_IMPORT_PATH } from "../../../constants";
import { PythonEditor } from "../../PythonEditor";

import { ResizableBoxHandle } from "./ResizableBoxHandle";
import { createPythonImportTokenLocator } from "./utils";

type PythonEditorBodyProps = {
  disabled?: boolean;
  source: string;
  proposedSource?: string;
  isRunnable: boolean;
  isEditMode?: boolean;
  hideRunButton?: boolean;
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
  hideRunButton,
  onRun,
  onCancel,
  isRunning,
  isDirty,
  withDebugger,
  onAcceptProposed,
  onRejectProposed,
}: PythonEditorBodyProps) {
  const [isResizing, setIsResizing] = useState(false);
  const showResizeHandle = isEditMode && withDebugger;
  const editorHeight = useInitialEditorHeight(isEditMode, showResizeHandle);
  const dispatch = useDispatch();

  const navigateToCommonLibrary = useCallback(
    (e: MouseEvent) => {
      const openInNewTab = e.metaKey || e.ctrlKey || e.button === 1;
      const href = Urls.transformPythonLibrary({
        path: SHARED_LIB_IMPORT_PATH,
      });
      if (openInNewTab) {
        window.open(href, "_blank", "noopener,noreferrer");
      } else {
        dispatch(push(href));
      }
    },
    [dispatch],
  );

  const clickableTokensExtension = useMemo(
    () =>
      clickableTokens([
        {
          tokenLocator: createPythonImportTokenLocator("common"),
          onClick: (e) => navigateToCommonLibrary(e),
        },
      ]),
    [navigateToCommonLibrary],
  );

  const editorContent = (
    <Flex h="100%" align="end" bg="background-secondary" pos="relative">
      <PythonEditor
        value={source}
        proposedValue={proposedSource}
        onChange={onChange}
        withPandasCompletions
        readOnly={!isEditMode || disabled}
        extensions={[clickableTokensExtension]}
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
          {!hideRunButton && (
            <RunButtonWithTooltip
              disabled={!isRunnable}
              isRunning={isRunning}
              isDirty={isDirty}
              onRun={onRun}
              onCancel={onCancel}
              getTooltip={() => t`Run Python script`}
            />
          )}
        </Stack>
      )}
    </Flex>
  );

  if (showResizeHandle) {
    return (
      <ResizableBox
        axis="y"
        height={editorHeight}
        handle={<ResizableBoxHandle />}
        resizeHandles={["s"]}
        style={isResizing ? undefined : { transition: "height 0.25s" }}
        onResizeStart={() => setIsResizing(true)}
        onResizeStop={() => setIsResizing(false)}
      >
        {editorContent}
      </ResizableBox>
    );
  }

  return (
    <Flex h="100%" direction="column">
      {editorContent}
    </Flex>
  );
}

function useInitialEditorHeight(
  isEditMode?: boolean,
  showResizeHandle?: boolean,
) {
  const { height: windowHeight } = useWindowSize();
  const availableHeight = windowHeight - HEADER_HEIGHT;

  if (!isEditMode) {
    // When not in edit mode, we don't need to split the container to show the results panel on the bottom
    return availableHeight;
  }

  if (!showResizeHandle) {
    // No preview panel (e.g. workspace) – height is not used; container uses 100%
    return availableHeight;
  }

  // Let's make the preview initial height be half of the available height at most
  const previewInitialHeight = Math.min(
    availableHeight / 2,
    PREVIEW_MAX_INITIAL_HEIGHT,
  );

  return Math.min(availableHeight - previewInitialHeight, EDITOR_HEIGHT);
}
