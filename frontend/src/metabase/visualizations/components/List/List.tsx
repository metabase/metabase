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

import { VisualizationProps } from "metabase-types/types/Visualization";

import ListCell from "./ListCell";
import TableFooter from "../TableSimple/TableFooter";
import {
  Root,
  ContentContainer,
  Table,
  TableContainer,
  ListRow,
} from "./List.styled";

function getBoundingClientRectSafe(ref: React.RefObject<HTMLBaseElement>) {
  return ref.current?.getBoundingClientRect?.() ?? ({} as DOMRect);
}

export interface ListVizProps extends VisualizationProps {
  getColumnTitle: (columnIndex: number) => string;
}

function List({
  card,
  data,
  series,
  settings,
  height,
  className,
  getColumnTitle,
  onVisualizationClick,
  visualizationIsClickable,
  getExtraDataForClick,
}: ListVizProps) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(1);

  const headerRef = useRef(null);
  const footerRef = useRef(null);
  const firstRowRef = useRef(null);

  useLayoutEffect(() => {
    const { height: headerHeight } = getBoundingClientRectSafe(headerRef);
    const { height: footerHeight = 0 } = getBoundingClientRectSafe(footerRef);
    const { height: rowHeight = 0 } = getBoundingClientRectSafe(firstRowRef);
    const currentPageSize = Math.floor(
      (height - headerHeight - footerHeight) / (rowHeight + 1),
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

  const paginatedRowIndexes = useMemo(() => rowIndexes.slice(start, end + 1), [
    rowIndexes,
    start,
    end,
  ]);

  const renderColumnHeader = useCallback(
    (col, colIndex) => (
      <th key={colIndex} data-testid="column-header">
        {getColumnTitle(colIndex)}
      </th>
    ),
    [getColumnTitle],
  );

  const renderRow = useCallback(
    (rowIndex, index) => {
      const ref = index === 0 ? firstRowRef : null;
      return (
        <ListRow key={rowIndex} ref={ref} data-testid="table-row">
          {data.rows[rowIndex].map((value, columnIndex) => (
            <ListCell
              key={`${rowIndex}-${columnIndex}`}
              value={value}
              data={data}
              series={series}
              settings={settings}
              rowIndex={rowIndex}
              columnIndex={columnIndex}
              getExtraDataForClick={getExtraDataForClick}
              checkIsVisualizationClickable={checkIsVisualizationClickable}
              onVisualizationClick={onVisualizationClick}
            />
          ))}
        </ListRow>
      );
    },
    [
      data,
      series,
      settings,
      checkIsVisualizationClickable,
      getExtraDataForClick,
      onVisualizationClick,
    ],
  );

  return (
    <Root className={className}>
      <ContentContainer>
        <TableContainer className="scroll-show scroll-show--hover">
          <Table className="fullscreen-normal-text fullscreen-night-text">
            <thead ref={headerRef} className="hide">
              <tr>{cols.map(renderColumnHeader)}</tr>
            </thead>
            <tbody>{paginatedRowIndexes.map(renderRow)}</tbody>
          </Table>
        </TableContainer>
      </ContentContainer>
      {pageSize < rows.length && (
        <TableFooter
          start={start}
          end={end}
          limit={limit}
          total={rows.length}
          handlePreviousPage={handlePreviousPage}
          handleNextPage={handleNextPage}
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
