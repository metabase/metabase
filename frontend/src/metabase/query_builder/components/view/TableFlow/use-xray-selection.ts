import _ from "underscore";

import { useMaybeLocation, useNavigate } from "metabase/router";
import type { Card, ConcreteTableId } from "metabase-types/api";

import { useXrayCharts } from "./XrayGallery";
import type { XrayChart } from "./utils";
import { XRAY_SEARCH_PARAM, parseXraySearchParam } from "./utils";
import { useXrayEdits } from "./xray-edits";

type XraySelection = {
  /** 1-based position of the selected x-ray chart, or `null` for the question's own view. */
  selectedPosition: number | null;
  onSelectPosition: (position: number | null) => void;
};

/**
 * The selected x-ray chart, kept in the URL so it survives reloads and steps with browser history.
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

  const onSelectPosition = (position: number | null) => {
    if (location == null || tableId == null) {
      return;
    }
    const nextSearchParams = new URLSearchParams(location.search);
    if (position == null) {
      nextSearchParams.delete(XRAY_SEARCH_PARAM);
    } else {
      nextSearchParams.set(XRAY_SEARCH_PARAM, `${tableId}-${position}`);
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
      { state: location.state ?? {} },
    );
  };

  return { selectedPosition, onSelectPosition };
}

type SelectedXrayChart = XraySelection & {
  /** All x-ray charts of the table; `null` while loading, on error, or when not needed. */
  charts: XrayChart[] | null;
  hasError: boolean;
  selectedChart: XrayChart | null;
  /** The selected chart's card including any filter/summarize edits. */
  selectedCard: Card | null;
  /** Whether edits changed the chart's query; display and settings changes don't count. */
  isSelectedCardEdited: boolean;
  onSelectedCardChange: (card: Card) => void;
  /** A chart is selected in the URL but the x-ray hasn't loaded yet. */
  isSelectedChartLoading: boolean;
};

/**
 * The x-ray chart on screen for `tableId`, with its current edits. Charts are fetched while
 * one is selected, or while `isGalleryOpen` so the gallery can list them.
 */
export function useSelectedXrayChart(
  tableId: ConcreteTableId | null,
  isGalleryOpen: boolean,
): SelectedXrayChart {
  const selection = useXraySelection(tableId);
  const { selectedPosition } = selection;
  const { charts, hasError } = useXrayCharts(
    tableId,
    isGalleryOpen || selectedPosition != null,
  );
  const { editedCards, setEditedCard } = useXrayEdits();

  const selectedChart =
    (selectedPosition != null ? charts?.[selectedPosition - 1] : null) ?? null;
  const selectionKey = selectedChart ? `${tableId}-${selectedPosition}` : null;
  const editedCard = selectionKey != null ? editedCards[selectionKey] : null;

  return {
    ...selection,
    charts,
    hasError,
    selectedChart,
    selectedCard: editedCard ?? selectedChart?.card ?? null,
    isSelectedCardEdited:
      editedCard != null &&
      selectedChart != null &&
      !_.isEqual(editedCard.dataset_query, selectedChart.card.dataset_query),
    onSelectedCardChange: (card) => {
      if (selectionKey != null) {
        setEditedCard(selectionKey, card);
      }
    },
    isSelectedChartLoading:
      selectedPosition != null && charts == null && !hasError,
  };
}
