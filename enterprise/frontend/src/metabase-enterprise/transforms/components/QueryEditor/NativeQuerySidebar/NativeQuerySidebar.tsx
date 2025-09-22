import { ResizableBox } from "react-resizable";
import { useWindowSize } from "react-use";
import { t } from "ttag";

import { NotebookNativePreview } from "metabase/querying/notebook/components/NotebookNativePreview";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { ResizeHandle } from "../ResizeHandle";

import S from "./NativeQuerySidebar.module.css";

export function NativeQuerySidebarToggle({
  isShowingNativeQueryPreview,
  onToggleNativeQueryPreview,
}: {
  isNative?: boolean;
  isShowingNativeQueryPreview: boolean;
  onToggleNativeQueryPreview: () => void;
}) {
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
  onConvertToNativeClick,
}: {
  question: Question;
  onConvertToNativeClick: (newQuestion: Question) => void;
}) {
  const { width: windowWidth } = useWindowSize();

  const minSidebarWidth = 428;
  const minNotebookWidth = 640;
  const maxSidebarWidth = windowWidth - minNotebookWidth;

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
      <NotebookNativePreview
        question={question}
        onConvertClick={onConvertToNativeClick}
        buttonTitle={t`Convert this transform to SQL`}
      />
    </ResizableBox>
  );
}
