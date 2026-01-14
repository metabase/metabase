import { useState } from "react";
import { ResizableBox } from "react-resizable";
import { useWindowSize } from "react-use";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import * as Urls from "metabase/lib/urls";
import RunButtonWithTooltip from "metabase/query_builder/components/RunButtonWithTooltip";
import {
  ActionIcon,
  Button,
  Flex,
  Group,
  Icon,
  Stack,
  Tooltip,
} from "metabase/ui";
import { SHARED_LIB_IMPORT_PATH } from "metabase-enterprise/transforms-python/constants";

import { PythonEditor } from "../../PythonEditor";

import S from "./PythonEditorBody.module.css";
import { ResizableBoxHandle } from "./ResizableBoxHandle";
import { hasImport, insertImport, removeImport } from "./utils";

type PythonEditorBodyProps = {
  source: string;
  proposedSource?: string;
  isRunnable: boolean;
  readOnly?: boolean;
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
  readOnly,
  onRun,
  onCancel,
  isRunning,
  isDirty,
  withDebugger,
  onAcceptProposed,
  onRejectProposed,
}: PythonEditorBodyProps) {
  const [isResizing, setIsResizing] = useState(false);
  const editorHeight = useInitialEditorHeight(readOnly);

  return (
    <ResizableBox
      axis="y"
      height={editorHeight}
      handle={<ResizableBoxHandle />}
      resizeHandles={readOnly || !withDebugger ? [] : ["s"]}
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
          data-testid="python-editor"
        />

        {!readOnly && (
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
        {!readOnly && (
          <SharedLibraryActions
            source={source}
            onChange={onChange}
            readOnly={readOnly}
          />
        )}
      </Flex>
    </ResizableBox>
  );
}

function useInitialEditorHeight(readOnly?: boolean) {
  const { height: windowHeight } = useWindowSize();
  const availableHeight = windowHeight - HEADER_HEIGHT;

  if (readOnly) {
    // When read-only, we don't need to split the container to show the results panel on the bottom
    return availableHeight;
  }

  // Let's make the preview initial height be half of the available height at most
  const previewInitialHeight = Math.min(
    availableHeight / 2,
    PREVIEW_MAX_INITIAL_HEIGHT,
  );

  return Math.min(availableHeight - previewInitialHeight, EDITOR_HEIGHT);
}

function SharedLibraryActions({
  source,
  onChange,
  readOnly,
}: {
  source: string;
  onChange: (source: string) => void;
  readOnly?: boolean;
}) {
  return (
    <Group className={S.libraryActions} p="md" gap="sm">
      <SharedLibraryImportButton
        source={source}
        onChange={onChange}
        disabled={readOnly}
      />
      <SharedLibraryEditLink disabled={readOnly} />
    </Group>
  );
}

function SharedLibraryImportButton({
  source,
  onChange,
  disabled,
}: {
  source: string;
  onChange: (source: string) => void;
  disabled?: boolean;
}) {
  const label = t`Import common library`;

  const handleToggleSharedLib = () => {
    if (hasImport(source, SHARED_LIB_IMPORT_PATH)) {
      onChange(removeImport(source, SHARED_LIB_IMPORT_PATH));
    } else {
      onChange(insertImport(source, SHARED_LIB_IMPORT_PATH));
    }
  };

  return (
    <Tooltip label={label}>
      <ActionIcon
        aria-label={label}
        onClick={handleToggleSharedLib}
        disabled={disabled}
      >
        <Icon name="reference" c="text-primary" />
      </ActionIcon>
    </Tooltip>
  );
}

function SharedLibraryEditLink({ disabled }: { disabled?: boolean }) {
  const label = t`Edit common library`;

  return (
    <Tooltip label={label}>
      <ActionIcon
        component={ForwardRefLink}
        target="_blank"
        aria-label={label}
        to={Urls.transformPythonLibrary({ path: SHARED_LIB_IMPORT_PATH })}
        disabled={disabled}
      >
        <Icon name="pencil" c="text-primary" />
      </ActionIcon>
    </Tooltip>
  );
}
