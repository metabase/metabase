import {
  skipToken,
  useGetCardQuery,
  useGetCollectionQuery,
  useGetDashboardQuery,
  useGetTableQuery,
} from "metabase/api";
import { isValidCollectionId } from "metabase/collections/utils";
import { DATABASES_COLLECTION } from "metabase/entities/collections";
import type { Collection } from "metabase-types/api";

import type { QuestionPickerItem } from "./QuestionPicker";
import type { TablePickerValue } from "./TablePicker";

export const useGetInitialContainer = (
  initialValue?: Pick<QuestionPickerItem, "model" | "id"> | TablePickerValue,
) => {
  // Figure out what we're working with
  const isQuestion =
    initialValue && ["card", "dataset", "metric"].includes(initialValue.model);
  const isCollection = initialValue?.model === "collection";
  const isDashboard = initialValue?.model === "dashboard";
  const isTable = initialValue?.model === "table";

  // Determine the IDs of the things we care about
  const cardId = isQuestion ? Number(initialValue.id) : undefined;
  const dashboardId = isDashboard ? Number(initialValue.id) : undefined;
  const collectionId = isCollection
    ? isValidCollectionId(initialValue.id)
      ? initialValue.id
      : "root"
    : undefined;

  // Fetch the initial value's entity
  const {
    data: currentCollection,
    isLoading: isCollectionLoading,
    error: currentCollectionError,
  } = useGetCollectionQuery(collectionId ? { id: collectionId } : skipToken);

  const {
    data: currentQuestion,
    isLoading: isQuestionLoading,
    error: currentQuestionError,
  } = useGetCardQuery(cardId ? { id: cardId } : skipToken);

  const {
    data: currentDashboard,
    isLoading: isDashboardLoading,
    error: currentDashboardError,
  } = useGetDashboardQuery(dashboardId ? { id: dashboardId } : skipToken);

  // If the initial value was a card or dashboard, fetch it's container
  const {
    data: currentQuestionCollection,
    isLoading: isCurrentQuestionCollectionLoading,
    error: currentQuestionCollectionError,
  } = useGetCollectionQuery(
    currentQuestion
      ? { id: currentQuestion.collection_id ?? "root" }
      : skipToken,
  );

  const {
    data: currentQuestionDashboard,
    isLoading: isCurrentQuestionDashboardLoading,
    error: currentQuestionDashboardError,
  } = useGetDashboardQuery(
    currentQuestion?.dashboard_id
      ? { id: currentQuestion.dashboard_id }
      : skipToken,
  );

  // This is bad, and should be fixed. This shouldn't really be required (collections come back with dashboards),
  // And note how we swap the ID out for root
  const {
    data: currentDashboardCollection,
    isLoading: isCurrentDashboardCollectionLoading,
    error: CurrentDashboardCollectionError,
  } = useGetCollectionQuery(
    currentDashboard
      ? { id: currentDashboard.collection_id ?? "root" }
      : skipToken,
  );

  const {
    data: currentTable,
    isLoading: isCurrentTableLoading,
    error: currentTableError,
  } = useGetTableQuery(
    initialValue != null && isTable ? { id: initialValue.id } : skipToken,
  );

  const currentTableCollection =
    currentTable != null
      ? (currentTable.collection ?? (DATABASES_COLLECTION as Collection))
      : undefined;

  return {
    currentTable,
    currentQuestion,
    currentCollection:
      currentTableCollection ??
      currentQuestionCollection ??
      currentDashboardCollection ??
      currentCollection,
    currentDashboard: currentQuestionDashboard ?? currentDashboard,
    isLoading:
      isCollectionLoading ||
      isQuestionLoading ||
      isDashboardLoading ||
      isCurrentTableLoading ||
      isCurrentQuestionCollectionLoading ||
      isCurrentQuestionDashboardLoading ||
      isCurrentDashboardCollectionLoading,
    error:
      currentTableError ??
      currentCollectionError ??
      currentDashboardError ??
      currentQuestionError ??
      currentQuestionCollectionError ??
      CurrentDashboardCollectionError ??
      currentQuestionDashboardError,
  };
};
