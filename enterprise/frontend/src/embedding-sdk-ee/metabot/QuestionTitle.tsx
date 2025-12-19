import { getQuestionTitle } from "embedding-sdk-bundle/components/private/QuestionTitle";
import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { Text } from "metabase/ui";

export function QuestionTitle() {
  const { question } = useSdkQuestionContext();
  const titleText = getQuestionTitle({ question });

  if (titleText === null) {
    return null;
  }

  return (
    <Text fw={700} c="text-primary" fz="xl">
      {titleText}
    </Text>
  );
}
