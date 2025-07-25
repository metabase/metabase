import { useState } from "react";
import { t } from "ttag";

import { useLazyGetCardQuery } from "metabase/api";
import {
  QuestionPickerModal,
  type QuestionPickerValueItem,
} from "metabase/common/components/Pickers/QuestionPicker";
import { Flex, Stack } from "metabase/ui";

import { NewTransformModal } from "../../components/NewTransformModal";
import { newTransformQueryUrl } from "../../utils/urls";

import { NewTransformOption } from "./NewTransformOption";

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
    <Flex direction="column" flex={1} h="100%" justify="center" align="center">
      <Stack>
        <NewTransformOption
          icon="notebook"
          label={t`Use the notebook editor`}
          description={t`This automatically inherits metadata from your source tables.`}
          link={newTransformQueryUrl()}
        />
        <NewTransformOption
          icon="sql"
          label={t`Use a native query`}
          description={t`You can always fall back to a SQL or native query, which is a bit more manual.`}
          link={newTransformQueryUrl()}
        />
        <NewTransformOption
          icon="copy"
          label={t`Use an existing question or model`}
          description={t`You can copy the query definition to a new transform.`}
          onClick={handleQuestionModalOpen}
        />
      </Stack>
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
          source={card.type === "question" ? "question" : "model"}
          onClose={handleModalClose}
        />
      )}
    </Flex>
  );
}
