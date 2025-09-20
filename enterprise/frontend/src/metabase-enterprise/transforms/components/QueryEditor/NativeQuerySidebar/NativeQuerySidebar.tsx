import { ResizableBox } from "react-resizable";
import { useWindowSize } from "react-use";
import { t } from "ttag";

import { ControlledNotebookNativePreview } from "metabase/querying/notebook/components/NotebookNativePreview/NotebookNativePreview";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { ResizeHandle } from "../ResizeHandle";

import S from "./NativeQuerySidebar.module.css";

export function NativeQuerySidebarToggle({
  canConvertToNative,
  isShowingNativeQueryPreview,
  onToggleNativeQueryPreview,
}: {
  canConvertToNative?: boolean;
  isShowingNativeQueryPreview: boolean;
  onToggleNativeQueryPreview: () => void;
}) {
  if (!canConvertToNative) {
    return null;
  }
  return (
    <Tooltip label={isShowingNativeQueryPreview ? t`Hide SQL` : t`View SQL`}>
      <ActionIcon
        key="view-sql"
        onClick={onToggleNativeQueryPreview}
        size="lg"
        className={S.nativeSidebarToggle}
        color="text"
        variant="subtle"
      >
        <Icon name="sql" color="text" />
      </ActionIcon>
    </Tooltip>
  );
}

export function NativeQuerySidebar({
  question,
  onConvertToSQLClick,
  canConvertToNative,
}: {
  question: Question;
  onConvertToSQLClick: (newQuestion: Question) => void;
  canConvertToNative?: boolean;
}) {
  const { width: windowWidth } = useWindowSize();

  const minSidebarWidth = 428;
  const minNotebookWidth = 640;
  const maxSidebarWidth = windowWidth - minNotebookWidth;

  if (!canConvertToNative) {
    return null;
  }

  return (
    <ResizableBox
      width={minSidebarWidth}
      minConstraints={[minSidebarWidth, 0]}
      maxConstraints={[maxSidebarWidth, 0]}
      axis="x"
      resizeHandles={["w"]}
      handle={<ResizeHandle />}
      style={{
        borderLeft: "1px solid var(--mb-color-border)",
        marginInlineStart: "0.25rem",
      }}
    >
      <ControlledNotebookNativePreview
        question={question}
        onConvertClick={onConvertToSQLClick}
        buttonTitle={t`Convert this transform to SQL`}
      />
    </ResizableBox>
  );
}
