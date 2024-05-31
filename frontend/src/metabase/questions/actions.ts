import Questions from "metabase/entities/questions";
import Tables from "metabase/entities/tables";
import { loadMetadataForDependentItems } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Card, TableId } from "metabase-types/api";
import { isSavedCard } from "metabase-types/guards";
import type { Dispatch, GetState } from "metabase-types/store";

export interface LoadMetadataOptions {
  reload?: boolean;
}

export const loadMetadataForTable =
  (tableId: TableId, options?: LoadMetadataOptions) =>
  async (dispatch: Dispatch) => {
    try {
      await dispatch(Tables.actions.fetchMetadata({ id: tableId }, options));
    } catch (error) {
      console.error("Error in loadMetadataForTable", error);
    }
  };

export const loadMetadataForCard =
  (card: Card, options?: LoadMetadataOptions) => async (dispatch: Dispatch) => {
    await dispatch(loadMetadataForCards([card], options));
  };

export const loadMetadataForCards =
  (cards: Card[], options?: LoadMetadataOptions) =>
  async (dispatch: Dispatch) => {
    const savedCards = cards.filter(card => isSavedCard(card));
    const adhocCards = cards.filter(card => !isSavedCard(card));
    await Promise.all([
      dispatch(loadMetadataForSavedCards(savedCards, options)),
      dispatch(loadMetadataForAdhocCards(adhocCards, options)),
    ]);
  };

const loadMetadataForSavedCards =
  (cards: Card[], options?: LoadMetadataOptions) =>
  async (dispatch: Dispatch) => {
    const actions = cards.map(card =>
      Questions.actions.fetchMetadata({ id: card.id }, options),
    );
    return Promise.all(actions.map(dispatch)).catch(error => {
      console.error("Error in loadMetadataForSavedCards", error);
    });
  };

const loadMetadataForAdhocCards =
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
