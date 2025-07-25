import { useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useLazyGetCardQuery } from "metabase/api";
import {
  QuestionPickerModal,
  type QuestionPickerValueItem,
} from "metabase/common/components/Pickers/QuestionPicker";
import { Box, Button, Group } from "metabase/ui";

import { NewTransformModal } from "../../components/NewTransformModal";
import { newTransformQueryUrl } from "../../utils/urls";

type ModalType = "question" | "transform";

export function NewTransformPage() {
  const [getCard, { data: card }] = useLazyGetCardQuery();
  const [modalType, setModalType] = useState<ModalType>();

  const handleQuestionModalOpen = () => {
    setModalType("question");
  };

  const handleSelectQuestion = async (item: QuestionPickerValueItem) => {
    await getCard({ id: item.id });
    setModalType("transform");
  };

  const handleModalClose = () => {
    setModalType(undefined);
  };

  return (
    <Box flex="1 1 0" bg="bg-white">
      <Group>
        <Button component={Link} to={newTransformQueryUrl()}>
          {t`Use the notebook editor`}
        </Button>
        <Button
          onClick={handleQuestionModalOpen}
        >{t`Use an existing question or model`}</Button>
      </Group>
      {modalType === "question" && (
        <QuestionPickerModal
          title={t`Pick a question or model`}
          models={["card", "dataset"]}
          onChange={handleSelectQuestion}
          onClose={handleModalClose}
        />
      )}
      {modalType === "transform" && card != null && (
        <NewTransformModal
          query={card.dataset_query}
          label={card.name}
          onClose={handleModalClose}
        />
      )}
    </Box>
  );
}
