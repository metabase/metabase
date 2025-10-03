import { useEffect, useMemo, useState } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { useGetCardQuery } from "metabase/api/card";
import { useDispatch, useSelector, useStore } from "metabase/lib/redux";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import { getSetting } from "metabase/selectors/settings";
import { Button, Flex, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";

interface ModifyQuestionProps {
  cardId: number;
}

export const ModifyQuestion = ({ cardId }: ModifyQuestionProps) => {
  const { data: card, isLoading: isLoadingCard } = useGetCardQuery({
    id: cardId,
  });
  const store = useStore();
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);
  const reportTimezone = useSelector((state) =>
    getSetting(state, "report-timezone-long"),
  );
  const [modifiedQuestion, setModifiedQuestion] = useState<Question | null>(
    null,
  );

  const cardMetadataState = useAsync(async () => {
    if (!card) {
      return;
    }
    await dispatch(loadMetadataForCard(card));
  }, [card]);

  const question = useMemo(() => {
    const hasCardMetadataLoaded =
      !cardMetadataState.loading && cardMetadataState.error == null;

    if (!card || !hasCardMetadataLoaded) {
      return null;
    }

    return new Question(card, metadata);
  }, [cardMetadataState, card, metadata]);
  useEffect(() => setModifiedQuestion(question), [question]);

  const handleUpdateQuestion = async (newQuestion: Question) => {
    const currentDependencies = modifiedQuestion
      ? Lib.dependentMetadata(
          modifiedQuestion.query(),
          modifiedQuestion.id(),
          modifiedQuestion.type(),
        )
      : [];

    const nextDependencies = Lib.dependentMetadata(
      newQuestion.query(),
      newQuestion.id(),
      newQuestion.type(),
    );

    if (!_.isEqual(currentDependencies, nextDependencies)) {
      await dispatch(loadMetadataForCard(newQuestion.card()));
      const freshMetadata = getMetadata(store.getState());
      const questionWithFreshMetadata = new Question(
        newQuestion.card(),
        freshMetadata,
      );
      setModifiedQuestion(questionWithFreshMetadata);
    } else {
      setModifiedQuestion(newQuestion);
    }
  };

  const handleSave = async () => {
    if (!modifiedQuestion) {
      return;
    }

    try {
      const modifiedData = {
        dataset_query: modifiedQuestion.datasetQuery(),
        display: modifiedQuestion.display(),
        visualization_settings:
          modifiedQuestion.card().visualization_settings ?? {},
      };
      // eslint-disable-next-line no-console
      console.log({ modifiedData });

      // const newCardId = generateDraftCardId();

      // dispatch(
      //   createDraftCard({
      //     originalCard: card,
      //     modifiedData,
      //     draftId: newCardId,
      //   }),
      // );

      // onSave({ card_id: newCardId, name: card.name });
      // onClose();
    } catch (error) {
      console.error("Failed to save modified question:", error);
    }
  };

  if (isLoadingCard || cardMetadataState.loading) {
    return null;
  }

  return (
    <>
      {question && modifiedQuestion ? (
        <>
          <Notebook
            question={modifiedQuestion}
            isDirty={true}
            isRunnable={true}
            isResultDirty={true}
            reportTimezone={reportTimezone}
            hasVisualizeButton={false}
            updateQuestion={handleUpdateQuestion}
          />
          <Flex mt="lg" justify="flex-end" gap="0.5rem">
            <Button variant="filled" onClick={handleSave}>
              {t`Save and use`}
            </Button>
          </Flex>
        </>
      ) : (
        <Flex h="70vh" align="center" justify="center">
          <Text>{t`Failed to load question data`}</Text>
        </Flex>
      )}
    </>
  );
};
