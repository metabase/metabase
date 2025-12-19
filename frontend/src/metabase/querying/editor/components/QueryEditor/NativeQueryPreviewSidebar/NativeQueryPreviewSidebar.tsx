import { ResizableBox } from "react-resizable";
import { useWindowSize } from "react-use";
import { t } from "ttag";

import { NotebookNativePreview } from "metabase/querying/notebook/components/NotebookNativePreview";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { ResizeHandle } from "../ResizeHandle";

import S from "./NativeQueryPreviewSidebar.module.css";

type NativeQueryPreviewSidebarProps = {
  question: Question;
  convertToNativeTitle?: string;
  convertToNativeButtonLabel?: string;
  onConvertToNativeClick: (newQuestion: Question) => void;
};

export function NativeQueryPreviewSidebar({
  question,
  convertToNativeTitle,
  convertToNativeButtonLabel,
  onConvertToNativeClick,
}: NativeQueryPreviewSidebarProps) {
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
      className={S.nativeSidebar}
    >
      <NotebookNativePreview
        question={question}
        title={convertToNativeTitle}
        buttonTitle={convertToNativeButtonLabel}
        onConvertClick={onConvertToNativeClick}
      />
    </ResizableBox>
  );
}

type NativeQueryPreviewSidebarToggleProps = {
  isNativeQueryPreviewSidebarOpen: boolean;
  onToggleNativeQueryPreviewSidebar: () => void;
};

export function NativeQueryPreviewSidebarToggle({
  isNativeQueryPreviewSidebarOpen,
  onToggleNativeQueryPreviewSidebar,
}: NativeQueryPreviewSidebarToggleProps) {
  const label = isNativeQueryPreviewSidebarOpen ? t`Hide SQL` : t`View SQL`;

  return (
    <Tooltip label={label}>
      <ActionIcon
        key="view-sql"
        onClick={onToggleNativeQueryPreviewSidebar}
        size="lg"
        className={S.nativeSidebarToggle}
        c="text-primary"
        variant="subtle"
        aria-label={label}
      >
        <Icon name="sql" c="text-primary" />
      </ActionIcon>
    </Tooltip>
  );
}
