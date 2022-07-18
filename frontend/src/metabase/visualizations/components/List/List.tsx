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

import Button from "metabase/core/components/Button";
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

import { SavedCard } from "metabase-types/types/Card";
import { Row } from "metabase-types/types/Dataset";
import { DashboardWithCards } from "metabase-types/types/Dashboard";
import { VisualizationProps } from "metabase-types/types/Visualization";
import { State } from "metabase-types/store";

import { CellSlot } from "./types";
import ListCell from "./ListCell";
import {
  Root,
  ContentContainer,
  Footer,
  ListItemContainer,
  ListItemContent,
  RowActionsContainer,
  RowActionButtonContainer,
  LIST_ITEM_VERTICAL_GAP,
} from "./List.styled";

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
  isQueryBuilder?: boolean;
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
  settings,
  metadata,
  height,
  className,
  isDataApp,
  isQueryBuilder,
  onVisualizationClick,
  visualizationIsClickable,
  updateRow,
  deleteRow,
}: ListVizProps) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(1);

  const [focusedRow, setFocusedRow] = useState<unknown[] | null>(null);
  const { modalContent: confirmationModalContent, show: requestConfirmation } =
    useConfirmation();

  const footerRef = useRef(null);
  const firstRowRef = useRef(null);

  useLayoutEffect(() => {
    const { height: footerHeight = 0 } = getBoundingClientRectSafe(footerRef);
    const { height: rowHeight = 0 } = getBoundingClientRectSafe(firstRowRef);
    const rowHeightWithMargin =
      rowHeight + parseInt(LIST_ITEM_VERTICAL_GAP, 10);
    const currentPageSize = Math.floor(
      (height - footerHeight) / rowHeightWithMargin,
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
    const maybeSavedCard = card as SavedCard;
    return dashboard?.ordered_cards.find(
      dc => dc.card_id === maybeSavedCard.id,
    );
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
    (row: Row) => {
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

  const hasEditButton = settings["buttons.edit"];
  const hasDeleteButton = settings["buttons.delete"];

  const renderListItemCell = useCallback(
    (rowIndex: number, columnIndex: number | null, slot: CellSlot) => {
      if (columnIndex === null) {
        return null;
      }
      return (
        <ListCell
          key={`${rowIndex}-${columnIndex}`}
          value={data.rows[rowIndex][columnIndex]}
          slot={slot}
          data={data}
          settings={settings}
          columnIndex={columnIndex}
        />
      );
    },
    [settings, data],
  );

  const renderListItemLeftPart = useCallback(
    (rowIndex: number) => {
      const listVariant = settings["list.variant"];
      const { left } = listColumnIndexes;

      if (listVariant === "info") {
        const [firstColumnIndex, secondColumnIndex, thirdColumnIndex] = left;
        return (
          <ListItemContent>
            {renderListItemCell(rowIndex, firstColumnIndex, "left")}
            <div>
              {renderListItemCell(rowIndex, secondColumnIndex, "left")}
              {renderListItemCell(rowIndex, thirdColumnIndex, "left")}
            </div>
          </ListItemContent>
        );
      }

      return (
        <ListItemContent>
          {left.map(columnIndex =>
            renderListItemCell(rowIndex, columnIndex, "left"),
          )}
        </ListItemContent>
      );
    },
    [settings, listColumnIndexes, renderListItemCell],
  );

  const renderListItem = useCallback(
    (rowIndex, index) => {
      const ref = index === 0 ? firstRowRef : null;
      const row = data.rows[rowIndex];

      const { right } = listColumnIndexes;

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

      const onEditClick = (event: React.SyntheticEvent) => {
        setFocusedRow(row);
        event.stopPropagation();
      };

      const onDeleteClick = (event: React.SyntheticEvent) => {
        handleDelete(row);
        event.stopPropagation();
      };

      return (
        <ListItemContainer
          key={rowIndex}
          onClick={onRowClick}
          disabled={!isClickable}
          ref={ref}
          data-testid="table-row"
        >
          {renderListItemLeftPart(rowIndex)}
          <ListItemContent>
            {right.map(columnIndex =>
              renderListItemCell(rowIndex, columnIndex, "right"),
            )}
            {(hasEditButton || hasDeleteButton) && (
              <RowActionsContainer>
                {hasEditButton && (
                  <RowActionButtonContainer slot="right">
                    <Button
                      disabled={!isDataApp}
                      onClick={onEditClick}
                      small
                    >{t`Edit`}</Button>
                  </RowActionButtonContainer>
                )}
                {hasDeleteButton && (
                  <RowActionButtonContainer slot="right">
                    <Button
                      disabled={!isDataApp}
                      onClick={onDeleteClick}
                      small
                      danger
                    >{t`Delete`}</Button>
                  </RowActionButtonContainer>
                )}
              </RowActionsContainer>
            )}
          </ListItemContent>
        </ListItemContainer>
      );
    },
    [
      data,
      settings,
      listColumnIndexes,
      hasEditButton,
      hasDeleteButton,
      isDataApp,
      checkIsVisualizationClickable,
      onVisualizationClick,
      renderListItemLeftPart,
      renderListItemCell,
      handleDelete,
    ],
  );

  return (
    <>
      <Root className={className} isQueryBuilder={isQueryBuilder}>
        <ContentContainer>
          {paginatedRowIndexes.map(renderListItem)}
        </ContentContainer>
        {pageSize < rows.length && (
          <Footer
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
