import { loadMetadataForDependentItems } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Card, DatabaseId, TableId } from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";

export interface LoadMetadataOptions {
  reload?: boolean;
}

export const loadMetadataForCard =
  (card: Card, options?: LoadMetadataOptions) =>
  async (dispatch: Dispatch, getState: GetState) => {
    const getDependencies = () => {
      const question = new Question(card, getMetadata(getState()));
      return Lib.dependentMetadata(
        question.query(),
        question.id(),
        question.type(),
      );
    };
    await dispatch(loadMetadata(getDependencies, [], options));
  };

export const loadMetadataForTable =
  (databaseId: DatabaseId, tableId: TableId, options?: LoadMetadataOptions) =>
  async (dispatch: Dispatch, getState: GetState) => {
    const getDependencies = () => {
      const metadataProvider = Lib.metadataProvider(
        databaseId,
        getMetadata(getState()),
      );
      return Lib.tableOrCardDependentMetadata(metadataProvider, tableId);
    };
    await dispatch(loadMetadata(getDependencies, [], options));
  };

const loadMetadata =
  (
    getDependencies: () => Lib.DependentItem[],
    prevDependencies: Lib.DependentItem[],
    options?: LoadMetadataOptions,
  ) =>
  async (dispatch: Dispatch) => {
    const nextDependencies = getDependencies();
    const newDependencies = getNewDependencies(
      prevDependencies,
      nextDependencies,
    );
    if (newDependencies.length > 0) {
      const mergedDependencies = [...prevDependencies, ...newDependencies];
      await dispatch(loadMetadataForDependentItems(newDependencies, options));
      await dispatch(
        loadMetadata(getDependencies, mergedDependencies, options),
      );
    }
  };

function getDependencyKey(dependency: Lib.DependentItem) {
  return `${dependency.type}/${dependency.id}`;
}

function getNewDependencies(
  prevDependencies: Lib.DependentItem[],
  nextDependencies: Lib.DependentItem[],
) {
  const prevKeys = new Set(prevDependencies.map(getDependencyKey));
  return nextDependencies.filter(dep => !prevKeys.has(getDependencyKey(dep)));
}
