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

export const loadMetadataForCard = (
  card: Card,
  options?: LoadMetadataOptions,
) => loadMetadataForCards([card], options);

export const loadMetadataForCards =
  (cards: Card[], options?: LoadMetadataOptions) =>
  async (dispatch: Dispatch, getState: GetState) => {
    const getDependencies = () => {
      // it's important to create it once here for performance reasons
      // MBQL lib attaches parsed metadata to the object
      const metadata = getMetadata(getState());
      return cards
        .map(card => new Question(card, metadata))
        .flatMap(question => {
          const dependencies = [...Lib.dependentMetadata(question.query())];
          if (question.isSaved() && question.type() !== "question") {
            const tableId = getQuestionVirtualTableId(question.id());
            dependencies.push({ id: tableId, type: "table" });

            if (metadata.table(tableId)) {
              const adhocQuestion = question.composeQuestionAdhoc();
              dependencies.push(
                ...Lib.dependentMetadata(adhocQuestion.query()),
              );
            }
          }
          return dependencies;
        });
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
