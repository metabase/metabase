import { t } from "ttag";

import EmptyMetric from "assets/img/empty-states/qbnewb-metric.svg";
import EmptyModel from "assets/img/empty-states/qbnewb-model.svg";
import EmptyQuestion from "assets/img/empty-states/qbnewq-question.svg";
import { Box, Button, Modal, Stack, Text, Title } from "metabase/ui";
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
      image: EmptyQuestion,
      title: t`It's okay to play around with saved questions`,
      message: t`You can save your edits as a new question, or choose to overwrite the original question.`,
    };
  }

  if (type === "model") {
    return {
      image: EmptyModel,
      title: t`You can filter and summarize any model, and save your results as a question`,
      message: t`If you want to edit the model itself, click on the model's three-dot menu and select Edit query definition.`,
    };
  }

  if (type === "metric") {
    return {
      image: EmptyMetric,
      title: t`It's okay to play around with metrics`,
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
  const { image, title, message } = getLabels(question);

  /**
   * We need this value for both the header and the body content width.
   * Can't set it on the Modal.Content because it overrides the actual modal width.
   */
  const contentWidth = "28rem";

  return (
    <Modal.Root opened={isShowingNewbModal} onClose={onClose} size={560}>
      <Modal.Overlay />
      <Modal.Content p="xl" ta="center">
        <Modal.Header maw={contentWidth} mx="auto" my="md">
          <Stack align="center" w="100%">
            <Box w="6rem">
              <img
                src={image}
                alt={t`Saved entity modal empty state illustration`}
              />
            </Box>
            <Title order={3}>{title}</Title>
          </Stack>
        </Modal.Header>
        <Modal.Body maw={contentWidth} mx="auto" my="md">
          <Text mb="lg">{message}</Text>
          <Button
            variant="filled"
            onClick={onClose}
          >{t`Start exploring`}</Button>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};
