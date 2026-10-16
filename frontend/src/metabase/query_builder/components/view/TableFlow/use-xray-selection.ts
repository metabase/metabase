import { serializeCardForUrl } from "metabase/common/utils/card";
import { useMaybeLocation, useNavigate } from "metabase/router";
import type { Card, ConcreteTableId } from "metabase-types/api";

import { useXrayCharts } from "./XrayGallery";
import type { XrayChart } from "./utils";
import {
  XRAY_CARD_SEARCH_PARAM,
  XRAY_SEARCH_PARAM,
  isSameDatasetQuery,
  parseXrayCardSearchParam,
  parseXraySearchParam,
} from "./utils";
import { useXrayEdits } from "./xray-edits";

type XraySelection = {
  /** 1-based position of the selected x-ray chart, or `null` for the question's own view. */
  selectedPosition: number | null;
  /** The selected chart's edits as stored in the URL, if any. */
  editedCardFromUrl: Partial<Card> | null;
  /** Selects a chart along with its edits, adding a history entry. */
  onSelectPosition: (position: number | null, editedCard?: Card | null) => void;
  /** Stores the selected chart's edits, replacing the current history entry. */
  onEditedCardChange: (editedCard: Card) => void;
};

/**
 * The selected x-ray chart and its edits, kept in the URL so both survive reloads and
 * the selection steps with browser history.
 */
export function useXraySelection(
  tableId: ConcreteTableId | null,
): XraySelection {
  const location = useMaybeLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location?.search);
  const selectedPosition =
    tableId != null
      ? parseXraySearchParam(searchParams.get(XRAY_SEARCH_PARAM), tableId)
      : null;
  const editedCardFromUrl =
    selectedPosition != null
      ? parseXrayCardSearchParam(searchParams.get(XRAY_CARD_SEARCH_PARAM))
      : null;

  const updateSearchParams = (
    values: Record<string, string | null>,
    { replace }: { replace: boolean },
  ) => {
    if (location == null) {
      return;
    }
    const nextSearchParams = new URLSearchParams(location.search);
    for (const [key, value] of Object.entries(values)) {
      if (value == null) {
        nextSearchParams.delete(key);
      } else {
        nextSearchParams.set(key, value);
      }
    }
    const search = nextSearchParams.toString();
    navigate(
      {
        pathname: location.pathname,
        search: search.length > 0 ? `?${search}` : "",
        hash: location.hash,
      },
      // The query builder re-initializes on navigations without state, treating them as
      // external links; carrying its state over keeps the current question in place.
      { replace, state: location.state ?? {} },
    );
  };

  const serializeEditedCard = (card: Card) =>
    serializeCardForUrl(card, {
      includeOriginalCardId: false,
      includeDisplayIsLocked: true,
    });

  return {
    selectedPosition,
    editedCardFromUrl,
    onSelectPosition: (position, editedCard) => {
      if (tableId == null) {
        return;
      }
      updateSearchParams(
        {
          [XRAY_SEARCH_PARAM]:
            position == null ? null : `${tableId}-${position}`,
          [XRAY_CARD_SEARCH_PARAM]:
            position != null && editedCard != null
              ? serializeEditedCard(editedCard)
              : null,
        },
        { replace: false },
      );
    },
    onEditedCardChange: (editedCard) =>
      updateSearchParams(
        { [XRAY_CARD_SEARCH_PARAM]: serializeEditedCard(editedCard) },
        { replace: true },
      ),
  };
}

type SelectedXrayChart = Pick<XraySelection, "selectedPosition"> & {
  /** All x-ray charts of the table; `null` while loading, on error, or when not needed. */
  charts: XrayChart[] | null;
  hasError: boolean;
  selectedChart: XrayChart | null;
  /** Selects a chart, restoring any edits made to it earlier in this view. */
  onSelectPosition: (position: number | null) => void;
  /** The selected chart's card including any edits. */
  selectedCard: Card | null;
  /** Whether edits changed the chart's query; display and settings changes don't count. */
  isSelectedCardEdited: boolean;
  onSelectedCardChange: (card: Card) => void;
  /** A chart is selected in the URL but the x-ray hasn't loaded yet. */
  isSelectedChartLoading: boolean;
};

/**
 * The x-ray chart on screen for `tableId`, with its current edits. The selected chart's
 * edits live in the URL; edits to other charts are remembered while the view is open, so
 * returning to a chart restores them. Charts are fetched while one is selected, or while
 * `isGalleryOpen` so the gallery can list them.
 */
export function useSelectedXrayChart(
  tableId: ConcreteTableId | null,
  isGalleryOpen: boolean,
): SelectedXrayChart {
  const {
    selectedPosition,
    editedCardFromUrl,
    onSelectPosition,
    onEditedCardChange,
  } = useXraySelection(tableId);
  const { charts, hasError } = useXrayCharts(
    tableId,
    isGalleryOpen || selectedPosition != null,
  );
  const { editedCards, setEditedCard } = useXrayEdits();

  const selectedChart =
    (selectedPosition != null ? charts?.[selectedPosition - 1] : null) ?? null;
  const getSelectionKey = (position: number) => `${tableId}-${position}`;
  // the URL keeps only what the card serializes, so it's laid over the x-ray's own card
  const selectedCard =
    selectedChart != null
      ? { ...selectedChart.card, ...editedCardFromUrl }
      : null;

  return {
    selectedPosition,
    charts,
    hasError,
    selectedChart,
    onSelectPosition: (position) =>
      onSelectPosition(
        position,
        position != null ? editedCards[getSelectionKey(position)] : null,
      ),
    selectedCard,
    isSelectedCardEdited:
      selectedCard != null &&
      selectedChart != null &&
      !isSameDatasetQuery(
        selectedCard.dataset_query,
        selectedChart.card.dataset_query,
      ),
    onSelectedCardChange: (card) => {
      if (selectedPosition != null) {
        setEditedCard(getSelectionKey(selectedPosition), card);
        onEditedCardChange(card);
      }
    },
    isSelectedChartLoading:
      selectedPosition != null && charts == null && !hasError,
  };
}
