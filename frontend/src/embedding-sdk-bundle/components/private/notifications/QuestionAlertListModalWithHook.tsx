import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { QuestionAlertListModal } from "metabase/notifications/modals";

export function QuestionAlertListModalWithHook() {
  const { question } = useSdkQuestionContext();
  if (!question) {
    return null;
  }

  // XXX: Deal with closing the modal
  return <QuestionAlertListModal question={question} onClose={() => {}} />;
}
