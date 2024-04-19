import _ from "underscore";

import { loadMetadataForDependentItems } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { Card } from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";

export interface LoadMetadataOptions {
  reload?: boolean;
}

export const loadMetadataForCard =
  (card: Card, options?: LoadMetadataOptions) =>
  async (dispatch: Dispatch, getState: GetState) => {
    const question = new Question(card, getMetadata(getState()));
    const dependencies = questionDependentMetadata(question);

    await dispatch(loadMetadataForDependentItems(dependencies, options));

    if (shouldLoadAdhocMetadata(question)) {
      const questionWithMetadata = new Question(card, getMetadata(getState()));
      const adhocQuestion = questionWithMetadata.composeQuestionAdhoc();
      const adhocDependencies = questionDependentMetadata(adhocQuestion);
      await dispatch(loadMetadataForDependentItems(adhocDependencies, options));

      const updatedQuestion = new Question(card, getMetadata(getState()));
      const updatedAdHocQuestion = updatedQuestion.composeQuestionAdhoc();
      const updatedDependencies =
        questionDependentMetadata(updatedAdHocQuestion);

      if (!areDependenciesEqual(adhocDependencies, updatedDependencies)) {
        await dispatch(loadMetadataForCard(card, options));
      }
    } else {
      const updatedQuestion = new Question(card, getMetadata(getState()));
      const updatedDependencies = questionDependentMetadata(updatedQuestion);

      if (!areDependenciesEqual(dependencies, updatedDependencies)) {
        await dispatch(loadMetadataForCard(card, options));
      }
    }
  };

const shouldLoadAdhocMetadata = (question: Question): boolean => {
  return question.isSaved() && question.type() !== "question";
};

const questionDependentMetadata = (question: Question): Lib.DependentItem[] => {
  const dependencies = [...Lib.dependentMetadata(question.query())];

  if (shouldLoadAdhocMetadata(question)) {
    const tableId = getQuestionVirtualTableId(question.id());
    dependencies.push({ id: tableId, type: "table" });
  }

  return dependencies;
};

const areDependenciesEqual = (
  items1: Lib.DependentItem[],
  items2: Lib.DependentItem[],
): boolean => {
  const stringifyItem = ({ id, type }: Lib.DependentItem) => `${id}-${type}`;
  const difference = _.difference(
    items1.map(stringifyItem),
    items2.map(stringifyItem),
  );
  return difference.length === 0;
};
