import type { MetabaseQuestion } from "embedding-sdk-bundle/types";
import type { SdkDashboardId } from "embedding-sdk-bundle/types/dashboard";

import { SdkQuestion, type SdkQuestionProps } from "../../public/SdkQuestion";

export type NewQuestionBuilderProps = {
  /** The dashboard ID to add the new question to */
  dashboardId: SdkDashboardId;
  /** The dashboard name for the back button */
  dashboardName: string;
  /** Props to pass to the data picker (e.g., entityTypes filter) */
  dataPickerProps?: Pick<SdkQuestionProps, "entityTypes">;
  /** Callback when the user clicks back */
  onNavigateBack: () => void;
  /** Callback when the question is successfully created */
  onQuestionCreated: (
    question: MetabaseQuestion,
    dashboardTabId?: number,
  ) => void;
};

/**
 * A component that renders the question builder for creating a new question
 * to add to a dashboard. Used by the internal navigation stack.
 */
export function NewQuestionBuilder({
  dashboardId,
  dashboardName,
  dataPickerProps,
  onNavigateBack,
  onQuestionCreated,
}: NewQuestionBuilderProps) {
  return (
    <SdkQuestion
      questionId="new"
      targetDashboardId={dashboardId}
      onSave={(question, { isNewQuestion, dashboardTabId }) => {
        if (isNewQuestion) {
          onQuestionCreated(question, dashboardTabId);
        }
      }}
      onNavigateBack={onNavigateBack}
      backToDashboard={{
        model: "dashboard",
        id: dashboardId,
        name: dashboardName,
      }}
      entityTypes={dataPickerProps?.entityTypes}
      withChartTypeSelector
      height="700px"
    />
  );
}
