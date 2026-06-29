import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { getQuestionTitle } from "embedding-sdk-bundle/lib/sdk-question/get-question-title";
import { useTranslateContent } from "metabase/i18n/hooks";
import { Title } from "metabase/ui";

export function QuestionTitle() {
  const { question } = useSdkQuestionContext();
  const tc = useTranslateContent();
  const titleText = getQuestionTitle(question, tc);

  if (titleText === null) {
    return null;
  }

  return <Title order={2}>{titleText}</Title>;
}
