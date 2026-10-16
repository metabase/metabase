import cx from "classnames";
import { type ReactNode, useState } from "react";

import type { ConcreteTableId } from "metabase-types/api";

import S from "./TableFlow.module.css";
import { TableSearchCard } from "./TableSearchCard";
import { XrayChartDetail } from "./XrayChartDetail";
import { XrayGallery } from "./XrayGallery";
import type { XrayChart } from "./utils";

type TableFlowProps = {
  /** Source table of the question; the gallery is unavailable without one. */
  tableId: ConcreteTableId | null;
  searchText: string;
  onSearchTextChange: (searchText: string) => void;
  /** The question's own visualization, shown in the inset table card. */
  children: ReactNode;
};

/**
 * Lays out the query builder's table view as inset cards: a search bar with a
 * gallery toggle, an optional strip of x-ray charts for the source table, and
 * either the question's table or the selected x-ray chart with its data.
 */
export function TableFlow({
  tableId,
  searchText,
  onSearchTextChange,
  children,
}: TableFlowProps) {
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [selectedChart, setSelectedChart] = useState<XrayChart | null>(null);

  const handleGalleryToggle = () => {
    setIsGalleryOpen(!isGalleryOpen);
    setSelectedChart(null);
  };

  const handleSelectChart = (chart: XrayChart) => {
    setSelectedChart(chart.id === selectedChart?.id ? null : chart);
  };

  return (
    <div className={S.root}>
      <TableSearchCard
        searchText={searchText}
        isGalleryOpen={isGalleryOpen}
        canShowGallery={tableId != null}
        onSearchTextChange={onSearchTextChange}
        onGalleryToggle={handleGalleryToggle}
      />
      {isGalleryOpen && tableId != null && (
        <XrayGallery
          tableId={tableId}
          selectedChartId={selectedChart?.id ?? null}
          onSelectChart={handleSelectChart}
        />
      )}
      {selectedChart ? (
        <XrayChartDetail
          key={selectedChart.id}
          chart={selectedChart}
          onClose={() => setSelectedChart(null)}
        />
      ) : (
        <div className={cx(S.card, S.tableCard)}>{children}</div>
      )}
    </div>
  );
}
