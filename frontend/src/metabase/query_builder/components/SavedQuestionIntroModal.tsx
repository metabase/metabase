import { t } from "ttag";

import { Modal, Button, Text } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

interface Props {
  isShowingNewbModal: boolean;
  question: Question;
  onClose: () => void;
}

const getLabels = (question: Question) => {
  const type = question.type();

  if (type === "question") {
    return {
      title: t`It's okay to play around with saved questions`,
      message: t`You won't make any permanent changes to a saved question unless you click Save and choose to replace the original question.`,
    };
  }

  if (type === "model") {
    return {
      title: t`It's okay to play around with models`,
      message: t`You won't make any permanent changes to them unless you edit their query definition.`,
    };
  }
  throw new Error(`Unknown question.type(): ${type}`);
};

export const SavedQuestionIntroModal = ({
  question,
  isShowingNewbModal,
  onClose,
}: Props) => {
  const { title, message } = getLabels(question);

  return (
    <Modal.Root opened={isShowingNewbModal} onClose={onClose} size={500}>
      <Modal.Overlay />
      <Modal.Content p="md">
        <Modal.Header mb="md">
          <Modal.Title>{title}</Modal.Title>
        </Modal.Header>
        <Modal.Body ta="center">
          <Text mb="lg" align="left">
            {message}
          </Text>
          <Button variant="filled" onClick={onClose}>{t`Okay`}</Button>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};
