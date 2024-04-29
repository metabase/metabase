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
    if (shouldLoadAdhocMetadata(card)) {
      await dispatch(loadDependentMetadata(card, [], options));
    }
  };

const loadDependentMetadata =
  (
    card: Card,
    prevDependencies: Lib.DependentItem[],
    options?: LoadMetadataOptions,
  ) =>
  async (dispatch: Dispatch, getState: GetState) => {
    const nextDependencies = getDependencies(card, getState);
    const dependenciesDiff = getDependenciesDiff(
      prevDependencies,
      nextDependencies,
    );
    if (dependenciesDiff.length > 0) {
      await dispatch(loadMetadataForDependentItems(dependenciesDiff, options));
      const mergedDependencies = [...prevDependencies, ...dependenciesDiff];
      await dispatch(loadDependentMetadata(card, mergedDependencies, options));
    }
  };

function shouldLoadAdhocMetadata(card: Card) {
  return card.id != null && card.type !== "question";
}

function getDependencies(card: Card, getState: GetState) {
  const question = new Question(card, getMetadata(getState()));
  const dependencies = [...Lib.dependentMetadata(question.query())];
  if (shouldLoadAdhocMetadata(card)) {
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
