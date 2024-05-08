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
  (card: Card, options?: LoadMetadataOptions) => async (dispatch: Dispatch) => {
    await dispatch(loadDependentMetadata(card, [], options));
  };

const loadDependentMetadata =
  (
    card: Card,
    dependencies: Lib.DependentItem[],
    options?: LoadMetadataOptions,
  ) =>
  async (dispatch: Dispatch, getState: GetState) => {
    const question = new Question(card, getMetadata(getState()));
    const withAdhocMetadata = shouldLoadAdhocMetadata(question);
    const nextDependencies = getDependencies(question, withAdhocMetadata);
    const dependenciesDiff = getDependenciesDiff(
      dependencies,
      nextDependencies,
    );
    if (dependenciesDiff.length > 0) {
      await dispatch(loadMetadataForDependentItems(dependenciesDiff, options));
      const mergedDependencies = [...dependencies, ...dependenciesDiff];
      await dispatch(loadDependentMetadata(card, mergedDependencies, options));
    } else if (withAdhocMetadata) {
      const adhocCard = question.composeQuestionAdhoc().card();
      await dispatch(loadDependentMetadata(adhocCard, dependencies, options));
    }
  };

function shouldLoadAdhocMetadata(question: Question) {
  return question.isSaved() && question.type() !== "question";
}

function getDependencies(question: Question, withAdhocMetadata: boolean) {
  const dependencies = [...Lib.dependentMetadata(question.query())];
  if (withAdhocMetadata) {
    const tableId = getQuestionVirtualTableId(question.id());
    dependencies.push({ id: tableId, type: "table" });
  }

  return dependencies;
}

function getDependencyKey(dependency: Lib.DependentItem) {
  return `${dependency.type}/${dependency.id}`;
}

function getDependenciesDiff(
  prevDependencies: Lib.DependentItem[],
  nextDependencies: Lib.DependentItem[],
) {
  const prevKeys = new Set(prevDependencies.map(getDependencyKey));

  return nextDependencies.filter(dep => !prevKeys.has(getDependencyKey(dep)));
}
