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
          readOnly={!isEditMode}
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
