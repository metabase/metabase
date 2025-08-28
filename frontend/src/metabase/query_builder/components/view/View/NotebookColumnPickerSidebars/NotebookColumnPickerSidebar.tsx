import type Question from "metabase-lib/v1/Question";
import type { ColumnPickerSidebarData } from "metabase-types/store";

import { CustomColumnsColumnPickerSidebar } from "./CustomColumnsColumnPickerSidebar";
import { DataStepColumnPickerSidebar } from "./DataStepColumnPickerSidebar";
import { JoinStepColumnPickerSidebar } from "./JoinStepColumnPickerSidebar";

interface NotebookColumnPickerSidebarProps {
  question: Question;
  sidebarData: ColumnPickerSidebarData;
  onClose: () => void;
}

function NotebookColumnPickerSidebar({
  question,
  sidebarData,
  onClose,
}: NotebookColumnPickerSidebarProps) {
  if (!sidebarData) {
    return null;
  }

  switch (sidebarData.type) {
    case "data-step":
      return (
        <DataStepColumnPickerSidebar
          question={question}
          title={sidebarData.title}
          onClose={onClose}
        />
      );
    case "join-step":
      return (
        <JoinStepColumnPickerSidebar
          question={question}
          title={sidebarData.title}
          onClose={onClose}
        />
      );
    case "custom-columns":
      return (
        <CustomColumnsColumnPickerSidebar
          question={question}
          title={sidebarData.title}
          isDraggable={sidebarData.isDraggable}
          onClose={onClose}
        />
      );
    default:
      return null;
  }
}

export { NotebookColumnPickerSidebar };
