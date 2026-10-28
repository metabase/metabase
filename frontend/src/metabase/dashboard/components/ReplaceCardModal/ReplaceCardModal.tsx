import { t } from "ttag";

import {
  canonicalCollectionId,
  isLibraryDashboard,
} from "metabase/common/collections/utils";
import {
  type OmniPickerItem,
  type OmniPickerQuestionItem,
  type OmniPickerValue,
  isInCollectionTree,
} from "metabase/common/components/Pickers";
import {
  QuestionPickerModal,
  type QuestionPickerModalProps,
  getQuestionPickerValue,
} from "metabase/common/components/Pickers/QuestionPicker";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import { isQuestionDashCard } from "metabase/utils/dashboard";
import type {
  Card,
  Collection,
  CollectionId,
  Dashboard,
  DashboardId,
  QuestionDashboardCard,
  VirtualDashboardCard,
} from "metabase-types/api";

type ReplaceCardModalProps = {
  dashboard: Dashboard;
  dashcard: QuestionDashboardCard | VirtualDashboardCard;
  title?: string;
  onSelect: (card: OmniPickerQuestionItem) => void;
  onClose: () => void;
};

export function ReplaceCardModal({
  dashboard,
  dashcard,
  title = t`Pick what you want to replace this with`,
  onSelect,
  onClose,
}: ReplaceCardModalProps) {
  const currentCard = isQuestionDashCard(dashcard) ? dashcard.card : undefined;
  const isLibraryScoped = isLibraryDashboard(dashboard);
  const libraryRootId = isLibraryScoped
    ? getLibraryRootId(dashboard.collection)
    : undefined;
  const { data: libraryMetricsCollection, isLoading: isLoadingMetrics } =
    PLUGIN_LIBRARY.useGetLibraryChildCollectionByType({
      skip: !isLibraryScoped,
      type: "library-metrics",
    });

  if (isLoadingMetrics) {
    return null;
  }

  const libraryScopeProps: Pick<
    QuestionPickerModalProps,
    "options" | "searchParams" | "isHiddenItem"
  > = isLibraryScoped
    ? {
        options: {
          hasConfirmButtons: false,
          hasRootCollection: false,
          hasPersonalCollections: false,
          hasRecents: false,
          hasSearch: libraryRootId != null,
          disableSearchScope: true,
        },
        searchParams:
          libraryRootId != null ? { collection: libraryRootId } : undefined,
        isHiddenItem: isLibraryDataSection,
      }
    : { options: { hasConfirmButtons: false } };

  // without a value the picker would open at the root collection, outside the Library
  const value = isLibraryScoped
    ? getPickerValue({
        collectionId: libraryMetricsCollection?.id ?? libraryRootId,
      })
    : getPickerValue({
        card: currentCard,
        collectionId: dashboard.collection_id ?? undefined,
      });

  return (
    <QuestionPickerModal
      title={title}
      value={value}
      models={["card", "dataset", "metric", "dashboard"]}
      onChange={onSelect}
      onClose={onClose}
      isDisabledItem={(item) => isDisabledItem(item, dashboard.id)}
      {...libraryScopeProps}
    />
  );
}

// don't allow adding items that are already saved in a different dashboard
// probably only applicable to search and recents
export function isDisabledItem(item: OmniPickerItem, dashboardId: DashboardId) {
  return (
    (isInCollectionTree(item) &&
      !!item.dashboard_id &&
      item.dashboard_id !== dashboardId) ||
    (item.model === "dashboard" && item.id !== dashboardId)
  );
}

function getPickerValue({
  card,
  collectionId,
}: {
  card?: Card;
  collectionId: CollectionId | undefined;
}): OmniPickerValue | undefined {
  if (card?.id) {
    return getQuestionPickerValue(card);
  }
  return collectionId != null
    ? { model: "collection", id: collectionId }
    : undefined;
}

// the Library's sections are its direct children, so the Library root is the
// first collection on the way to any library collection
function getLibraryRootId(
  collection: Collection | null | undefined,
): CollectionId | undefined {
  const [rootId] = collection?.location?.split("/").filter(Boolean) ?? [];
  return canonicalCollectionId(rootId) ?? undefined;
}

function isLibraryDataSection(item: OmniPickerItem) {
  return (
    item.model === "collection" &&
    PLUGIN_LIBRARY.isLibraryDataCollectionType(item.type)
  );
}
