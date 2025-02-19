import { InteractiveQuestionResult } from "embedding-sdk/components/private/InteractiveQuestionResult";

import {
  InteractiveQuestion,
  type InteractiveQuestionProps,
} from "../InteractiveQuestion";

export type CreateQuestionProps = Partial<
  Omit<InteractiveQuestionProps, "questionId" | "children">
>;

export const CreateQuestion = ({
  onSave,
  isSaveEnabled = true,
  ...props
}: CreateQuestionProps = {}) => {
  return (
    <InteractiveQuestion
      {...props}
      isSaveEnabled={isSaveEnabled}
      onSave={(question, context) => {
        if (question) {
          onSave?.(question, context);
        }
      }}
    >
      <InteractiveQuestionResult withResetButton withChartTypeSelector />
    </InteractiveQuestion>
  );
};
