import { useSdkQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import { getQuestionTitle } from "embedding-sdk/components/private/QuestionTitle";
import { Text } from "metabase/ui";

export function QuestionTitle() {
  const { question } = useSdkQuestionContext();
  const titleText = getQuestionTitle({ question });

  return (
    <Text fw={700} c="var(--mb-color-text-primary)" fz="xl">
      {titleText}
    </Text>
  );
}
