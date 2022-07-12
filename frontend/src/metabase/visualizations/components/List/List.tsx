import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import { getIn } from "icepick";
import _ from "lodash";
import { t } from "ttag";
import { connect } from "react-redux";

import ExplicitSize from "metabase/components/ExplicitSize";
import Modal from "metabase/components/Modal";

import { useConfirmation } from "metabase/hooks/use-confirmation";

import WritebackModalForm from "metabase/writeback/containers/WritebackModalForm";
import {
  DeleteRowFromDataAppPayload,
  UpdateRowFromDataAppPayload,
  deleteRowFromDataApp,
  updateRowFromDataApp,
} from "metabase/dashboard/writeback-actions";

import Question from "metabase-lib/lib/Question";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Metadata from "metabase-lib/lib/metadata/Metadata";

import { DashboardWithCards } from "metabase-types/types/Dashboard";
import { VisualizationProps } from "metabase-types/types/Visualization";
import { State } from "metabase-types/store";

import ListCell from "./ListCell";
import TableFooter from "../TableSimple/TableFooter";
import {
  Root,
  ContentContainer,
  Table,
  TableContainer,
  ListRow,
  RowActionButton,
} from "./List.styled";
import { CellRoot } from "./ListCell.styled";

function getBoundingClientRectSafe(ref: React.RefObject<HTMLBaseElement>) {
  return ref.current?.getBoundingClientRect?.() ?? ({} as DOMRect);
}

interface ListVizDispatchProps {
  updateRow: (payload: UpdateRowFromDataAppPayload) => void;
  deleteRow: (payload: DeleteRowFromDataAppPayload) => void;
}

interface ListVizOwnProps extends VisualizationProps {
  dashboard?: DashboardWithCards;
  isDataApp?: boolean;
  metadata: Metadata;
  getColumnTitle: (columnIndex: number) => string;
}

export type ListVizProps = ListVizOwnProps & ListVizDispatchProps;

const mapDispatchToProps = {
  deleteRow: deleteRowFromDataApp,
  updateRow: updateRowFromDataApp,
};

function List({
  card,
  dashboard,
  data,
  series,
  settings,
  metadata,
  height,
  className,
  isDataApp,
  getColumnTitle,
  onVisualizationClick,
  visualizationIsClickable,
  getExtraDataForClick,
  updateRow,
  deleteRow,
}: ListVizProps) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(1);

  const [focusedRow, setFocusedRow] = useState<unknown[] | null>(null);
  const {
    modalContent: confirmationModalContent,
    show: requestConfirmation,
  } = useConfirmation();

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

  const resetFocusedRow = useCallback(() => {
    setFocusedRow(null);
  }, []);

  const checkIsVisualizationClickable = useCallback(
    clickedItem => visualizationIsClickable?.(clickedItem),
    [visualizationIsClickable],
  );

  const table = useMemo(() => {
    const question = new Question(card, metadata);
    if (question.isNative()) {
      return null;
    }
    const query = question.query() as StructuredQuery;
    if (!query.isRaw()) {
      return null;
    }
    return query.table();
  }, [card, metadata]);

  const connectedDashCard = useMemo(() => {
    return dashboard?.ordered_cards.find(dc => dc.card_id === card.id);
  }, [dashboard, card]);

  const handleUpdate = useCallback(
    (values: Record<string, unknown>) => {
      if (!table || !focusedRow || !connectedDashCard) {
        return;
      }
      const pkColumnIndex = table.fields.findIndex(field => field.isPK());
      const pkValue = focusedRow[pkColumnIndex];
      if (typeof pkValue === "string" || typeof pkValue === "number") {
        return updateRow({
          id: pkValue,
          table,
          values,
          dashCard: connectedDashCard,
        });
      }
    },
    [table, connectedDashCard, focusedRow, updateRow],
  );

  const handleDelete = useCallback(
    (row: unknown[]) => {
      if (!table || !connectedDashCard) {
        return;
      }
      const pkColumnIndex = table.fields.findIndex(field => field.isPK());
      const pkValue = row[pkColumnIndex];

      if (typeof pkValue !== "string" && typeof pkValue !== "number") {
        return;
      }
      requestConfirmation({
        title: t`Delete?`,
        message: t`This can't be undone.`,
        onConfirm: async () => {
          deleteRow({
            id: pkValue,
            table,
            dashCard: connectedDashCard,
          });
        },
      });
    },
    [table, connectedDashCard, deleteRow, requestConfirmation],
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

  const listColumnIndexes = useMemo(() => {
    const left = settings["list.columns"].left.map((idOrFieldRef: any) =>
      cols.findIndex(
        col =>
          col.id === idOrFieldRef || _.isEqual(col.field_ref, idOrFieldRef),
      ),
    );
    const right = settings["list.columns"].right.map((idOrFieldRef: any) =>
      cols.findIndex(
        col =>
          col.id === idOrFieldRef || _.isEqual(col.field_ref, idOrFieldRef),
      ),
    );
    return [...left, ...right];
  }, [cols, settings]);

  const hasEditButton = settings["buttons.edit"];
  const hasDeleteButton = settings["buttons.edit"];

  const renderRow = useCallback(
    (rowIndex, index) => {
      const ref = index === 0 ? firstRowRef : null;
      const row = data.rows[rowIndex];

      const onEditClick = (event: React.SyntheticEvent) => {
        setFocusedRow(row);
        event.stopPropagation();
      };

      const onDeleteClick = (event: React.SyntheticEvent) => {
        handleDelete(row);
        event.stopPropagation();
      };

      return (
        <ListRow key={rowIndex} ref={ref} data-testid="table-row">
          {listColumnIndexes.map((columnIndex, slotIndex) => (
            <ListCell
              key={`${rowIndex}-${columnIndex}`}
              value={row[columnIndex]}
              slot={slotIndex <= 2 ? "left" : "right"}
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
          {hasEditButton && (
            <CellRoot type="action">
              <RowActionButton
                disabled={!isDataApp}
                onClick={onEditClick}
              >{t`Edit`}</RowActionButton>
            </CellRoot>
          )}
          {hasDeleteButton && (
            <CellRoot type="action">
              <RowActionButton
                disabled={!isDataApp}
                onClick={onDeleteClick}
                danger
              >{t`Delete`}</RowActionButton>
            </CellRoot>
          )}
        </ListRow>
      );
    },
    [
      listColumnIndexes,
      data,
      series,
      settings,
      isDataApp,
      hasEditButton,
      hasDeleteButton,
      checkIsVisualizationClickable,
      getExtraDataForClick,
      onVisualizationClick,
      handleDelete,
    ],
  );

  return (
    <>
      <Root className={className}>
        <ContentContainer>
          <TableContainer className="scroll-show scroll-show--hover">
            <Table className="fullscreen-normal-text fullscreen-night-text">
              <thead ref={headerRef} className="hide">
                <tr>
                  {cols.map(renderColumnHeader)}
                  {hasEditButton && <th data-testid="column-header" />}
                  {hasDeleteButton && <th data-testid="column-header" />}
                </tr>
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
      {isDataApp && table && Array.isArray(focusedRow) && (
        <Modal onClose={resetFocusedRow}>
          <WritebackModalForm
            table={table}
            row={focusedRow}
            onSubmit={handleUpdate}
            onClose={resetFocusedRow}
          />
        </Modal>
      )}
      {isDataApp && confirmationModalContent}
    </>
  );
}

const ConnectedList = connect<
  unknown,
  ListVizDispatchProps,
  ListVizOwnProps,
  State
>(
  null,
  mapDispatchToProps,
)(List);

export default ExplicitSize({
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  refreshMode: (props: VisualizationProps) =>
    props.isDashboard && !props.isEditing ? "debounce" : "throttle",
})(ConnectedList);
