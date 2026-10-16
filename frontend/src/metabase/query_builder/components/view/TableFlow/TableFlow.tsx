import cx from "classnames";
import { type ReactNode, useState } from "react";

import type { ConcreteTableId, RawSeries } from "metabase-types/api";

import S from "./TableFlow.module.css";
import { TableSearchBar } from "./TableSearchBar";
import { XrayChartDetail } from "./XrayChartDetail";
import { XrayGallery } from "./XrayGallery";
import type { XrayChart } from "./utils";

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
 * x-ray chart above its data.
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
  const [selectedChart, setSelectedChart] = useState<XrayChart | null>(null);
  if (!isGalleryOpen && selectedChart) {
    setSelectedChart(null);
  }

  // The main card fills the visible area so the page scrolls only once the gallery or a chart is added above it.
  const mainCardHeight = `max(20rem, calc(${viewportHeight}px - 2 * var(--mantine-spacing-md)))`;

  return (
    <div className={S.root}>
      {isGalleryOpen && tableId != null && (
        <XrayGallery
          tableId={tableId}
          rawSeries={rawSeries}
          selectedChartId={selectedChart?.id ?? null}
          onSelectChart={setSelectedChart}
        />
      )}
      {selectedChart ? (
        <XrayChartDetail
          key={selectedChart.id}
          chart={selectedChart}
          tableHeight={mainCardHeight}
          onClose={() => setSelectedChart(null)}
        />
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
