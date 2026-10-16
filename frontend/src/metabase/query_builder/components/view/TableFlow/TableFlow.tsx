import cx from "classnames";
import type { ReactNode } from "react";

import { Skeleton } from "metabase/ui";
import type { ConcreteTableId, RawSeries } from "metabase-types/api";

import S from "./TableFlow.module.css";
import { TableSearchBar } from "./TableSearchBar";
import { XrayChartDetail } from "./XrayChartDetail";
import { XrayGallery } from "./XrayGallery";
import { useSelectedXrayChart } from "./use-xray-selection";

type TableFlowProps = {
  /** Source table of the question; the gallery is unavailable without one. */
  tableId: ConcreteTableId | null;
  isGalleryOpen: boolean;
  /** Height of the scrollable area the flow is laid out in. */
  viewportHeight: number;
  /** The question's results, shown as the gallery's raw records card. */
  rawSeries: RawSeries | null;
  /** `null` hides the search bar. */
  searchText: string | null;
  onSearchTextChange: (searchText: string) => void;
  /** The question's own visualization, shown in the inset card. */
  children: ReactNode;
};

/**
 * Lays out the query builder's view as inset cards: an optional strip of the
 * source table's raw records and x-ray charts, then either the question's own
 * visualization (with an attached search bar for tables) or the selected
 * x-ray chart above its data. The selection lives in the URL and outlasts
 * closing the gallery.
 */
export function TableFlow({
  tableId,
  isGalleryOpen,
  viewportHeight,
  rawSeries,
  searchText,
  onSearchTextChange,
  children,
}: TableFlowProps) {
  const {
    charts,
    hasError,
    selectedPosition,
    onSelectPosition,
    selectedChart,
    selectedCard,
    onSelectedCardChange,
    isSelectedChartLoading,
  } = useSelectedXrayChart(tableId, isGalleryOpen);

  // The main card fills the visible area so the page scrolls only once the gallery or a chart is added above it.
  const mainCardHeight = `max(20rem, calc(${viewportHeight}px - 2 * var(--mantine-spacing-md)))`;

  return (
    <div className={S.root}>
      {isGalleryOpen && tableId != null && (
        <XrayGallery
          charts={charts}
          hasError={hasError}
          rawSeries={rawSeries}
          selectedPosition={selectedChart ? selectedPosition : null}
          onSelectPosition={onSelectPosition}
        />
      )}
      {selectedChart && selectedCard ? (
        <XrayChartDetail
          key={selectedChart.id}
          chart={selectedChart}
          card={selectedCard}
          tableHeight={mainCardHeight}
          onCardChange={onSelectedCardChange}
        />
      ) : isSelectedChartLoading ? (
        <Skeleton className={cx(S.card, S.detailChartCard)} />
      ) : (
        <div
          className={cx(S.card, S.tableCard)}
          style={{ height: mainCardHeight }}
        >
          {searchText != null && (
            <TableSearchBar
              searchText={searchText}
              onSearchTextChange={onSearchTextChange}
            />
          )}
          <div className={S.tableArea}>{children}</div>
        </div>
      )}
    </div>
  );
}
