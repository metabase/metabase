import Questions from "metabase/entities/questions";
import Tables from "metabase/entities/tables";
import { loadMetadataForDependentItems } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Card, TableId } from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";

export interface LoadMetadataOptions {
  reload?: boolean;
}

export const loadMetadataForCard =
  (card: Card, options?: LoadMetadataOptions) => async (dispatch: Dispatch) => {
    await dispatch(Questions.actions.fetchMetadata({ id: card.id }, options));
  };

export const loadMetadataForTable =
  (tableId: TableId, options?: LoadMetadataOptions) =>
  async (dispatch: Dispatch) => {
    await dispatch(Tables.actions.fetchMetadata({ id: tableId }, options));
  };

// this function should be removed when x-ray dashboards get their own metadata endpoint
export const loadMetadataForCards =
  (cards: Card[], options?: LoadMetadataOptions) =>
  async (dispatch: Dispatch, getState: GetState) => {
    const getDependencies = () => {
      // it's important to create it once here for performance reasons
      // MBQL lib attaches parsed metadata to the object
      const metadata = getMetadata(getState());
      return cards
        .map(card => new Question(card, metadata))
        .flatMap(question =>
          Lib.dependentMetadata(
            question.query(),
            question.id(),
            question.type(),
          ),
        );
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
