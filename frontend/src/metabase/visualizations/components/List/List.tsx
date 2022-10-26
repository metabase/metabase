import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import { getIn } from "icepick";
import _ from "lodash";

import ExplicitSize from "metabase/components/ExplicitSize";
import { DashboardWithCards } from "metabase-types/types/Dashboard";
import { VisualizationProps } from "metabase-types/types/Visualization";
import Metadata from "metabase-lib/lib/metadata/Metadata";

import {
  Root,
  Footer,
  LIST_ITEM_BORDER_DIVIDER_WIDTH,
  ListBody,
  ListItemRow,
} from "./List.styled";

import { VariantInfo } from "./VariantInfo";

function getBoundingClientRectSafe(ref: React.RefObject<HTMLBaseElement>) {
  return ref.current?.getBoundingClientRect?.() ?? ({} as DOMRect);
}

interface ListVizOwnProps extends VisualizationProps {
  dashboard?: DashboardWithCards;
  isDataApp?: boolean;
  isQueryBuilder?: boolean;
  metadata: Metadata;
  getColumnTitle: (columnIndex: number) => string;
}

export type ListVizProps = ListVizOwnProps;

function List({
  card,
  data,
  settings,
  height,
  className,
  isDataApp,
  isQueryBuilder,
  getColumnTitle,
  onVisualizationClick,
  visualizationIsClickable,
}: ListVizProps) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(1);

  const footerRef = useRef(null);
  const firstRowRef = useRef(null);

  useLayoutEffect(() => {
    const { height: footerHeight = 0 } = getBoundingClientRectSafe(footerRef);
    const { height: rowHeight = 0 } = getBoundingClientRectSafe(firstRowRef);

    const rowHeightWithMargin =
      rowHeight + parseInt(LIST_ITEM_BORDER_DIVIDER_WIDTH, 10);
    const currentPageSize = Math.floor(
      (height - footerHeight) / rowHeightWithMargin,
    );
    const normalizedPageSize = Math.max(1, currentPageSize);
    if (pageSize !== normalizedPageSize) {
      setPageSize(normalizedPageSize);
    }
  }, [height, pageSize]);

  const checkIsVisualizationClickable = useCallback(
    clickedItem => visualizationIsClickable?.(clickedItem),
    [visualizationIsClickable],
  );

  const { rows, cols } = data;
  const limit = getIn(card, ["dataset_query", "query", "limit"]) || undefined;

  const start = pageSize * page;
  const end = Math.min(rows.length - 1, pageSize * (page + 1) - 1);

  const handlePreviousPage = useCallback(() => {
    setPage(p => p - 1);
  }, []);

  const handleNextPage = useCallback(() => {
    setPage(p => p + 1);
  }, []);

  const rowIndexes = useMemo(() => _.range(0, rows.length), [rows]);

  const paginatedRowIndexes = useMemo(
    () => rowIndexes.slice(start, end + 1),
    [rowIndexes, start, end],
  );

  const listColumnIndexes = useMemo<{ left: number[]; right: number[] }>(() => {
    function getColumnIndex(idOrFieldRef: any) {
      if (idOrFieldRef === null) {
        return null;
      }
      return cols.findIndex(
        col =>
          col.id === idOrFieldRef || _.isEqual(col.field_ref, idOrFieldRef),
      );
    }

    const left = settings["list.columns"].left.map(getColumnIndex);
    const right = settings["list.columns"].right.map(getColumnIndex);
    return { left, right };
  }, [cols, settings]);

  const renderListItem = useCallback(
    (rowIndex, index) => {
      const ref = index === 0 ? firstRowRef : null;
      const row = data.rows[rowIndex];

      const clickObject = {
        settings,
        origin: {
          row,
          cols: data.cols,
          rowIndex,
        },
        data: row.map((value, columnIndex) => ({
          value,
          col: data.cols[columnIndex],
        })),
      };

      const isClickable =
        isDataApp && checkIsVisualizationClickable(clickObject);

      const onRowClick = () => {
        onVisualizationClick(clickObject);
      };

      return (
        <ListItemRow
          key={rowIndex}
          ref={ref}
          onClick={onRowClick}
          isClickable={isClickable}
          data-testid="table-row"
        >
          <VariantInfo
            data={data}
            row={row}
            listColumnIndexes={listColumnIndexes}
            settings={settings}
            getColumnTitle={getColumnTitle}
          />
        </ListItemRow>
      );
    },
    [
      data,
      settings,
      listColumnIndexes,
      isDataApp,
      checkIsVisualizationClickable,
      onVisualizationClick,
      getColumnTitle,
    ],
  );

  return (
    <Root className={className} isQueryBuilder={isQueryBuilder}>
      <ListBody>{paginatedRowIndexes.map(renderListItem)}</ListBody>
      {pageSize < rows.length && (
        <Footer
          start={start}
          end={end}
          limit={limit}
          total={rows.length}
          onPreviousPage={handlePreviousPage}
          onNextPage={handleNextPage}
          ref={footerRef}
        />
      )}
    </Root>
  );
}

export default ExplicitSize({
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  refreshMode: (props: VisualizationProps) =>
    props.isDashboard && !props.isEditing ? "debounce" : "throttle",
})(List);
