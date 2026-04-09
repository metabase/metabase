import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { QuestionAlertListModal } from "metabase/notifications/modals";

import { useQuestionAlertModalContext } from "./context/QuestionAlertModalProvider";

export function SdkQuestionAlertListModal() {
  const { question } = useSdkQuestionContext();
  const { isOpen: isModalOpen, close: closeModal } =
    useQuestionAlertModalContext();

  if (!question || !isModalOpen) {
    return null;
  }

  return <QuestionAlertListModal question={question} onClose={closeModal} />;
}
