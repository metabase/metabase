import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import { getIn } from "icepick";
import _ from "lodash";

import Button from "metabase/core/components/Button";
import CheckBox from "metabase/core/components/CheckBox";
import ExplicitSize from "metabase/components/ExplicitSize";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

import { useConfirmation } from "metabase/hooks/use-confirmation";

import { useDataAppContext } from "metabase/writeback/containers/DataAppContext";

import { SavedCard } from "metabase-types/types/Card";
import { DashboardWithCards } from "metabase-types/types/Dashboard";
import { VisualizationProps } from "metabase-types/types/Visualization";
import Metadata from "metabase-lib/lib/metadata/Metadata";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Question from "metabase-lib/lib/Question";

import ListCell from "./ListCell";
import {
  Root,
  Table,
  TableHeader,
  TableBody,
  ColumnHeader,
  Footer,
  ListItemContainer,
  BulkSelectionControlContainer,
  InfoContentContainer,
  RowIconContainer,
  LIST_ITEM_BORDER_DIVIDER_WIDTH,
} from "./List.styled";

function getBoundingClientRectSafe(ref: React.RefObject<HTMLBaseElement>) {
  return ref.current?.getBoundingClientRect?.() ?? ({} as DOMRect);
}

function stopClickPropagation(event: React.SyntheticEvent) {
  event.stopPropagation();
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
  dashboard,
  data,
  settings,
  metadata,
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

  const [focusedRow, setFocusedRow] = useState<unknown[] | null>(null);
  const { modalContent: confirmationModalContent, show: requestConfirmation } =
    useConfirmation();

  const footerRef = useRef(null);
  const firstRowRef = useRef(null);

  const { bulkActions } = useDataAppContext();

  const listVariant = settings["list.variant"];

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

  const canSelectForBulkAction = useMemo(() => {
    return (
      settings["actions.bulk_enabled"] &&
      (!bulkActions.cardId || bulkActions.cardId === connectedDashCard?.card_id)
    );
  }, [connectedDashCard, settings, bulkActions]);

  const isSelectingItems = useMemo(() => {
    return (
      settings["actions.bulk_enabled"] &&
      bulkActions.cardId === connectedDashCard?.card_id &&
      bulkActions.selectedRowIndexes.length > 0
    );
  }, [connectedDashCard, settings, bulkActions]);

  const hasInlineActions = false; // TODO remove completely

  const renderBulkSelectionControl = useCallback(
    (rowIndex: number) => {
      const isSelected = bulkActions.selectedRowIndexes.includes(rowIndex);

      return (
        <BulkSelectionControlContainer isSelectingItems={isSelectingItems}>
          <ListCell.Root>
            <CheckBox
              checked={isSelected}
              onClick={stopClickPropagation}
              onChange={event => {
                const isSelectedNow = event.target.checked;
                if (isSelectedNow) {
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
                  bulkActions.addRow(card.id, rowIndex);
                } else {
                  bulkActions.removeRow(rowIndex);
                }
              }}
            />
          </ListCell.Root>
        </BulkSelectionControlContainer>
      );
    },
    [card, bulkActions, isSelectingItems],
  );

  const renderListItemCell = useCallback(
    (rowIndex: number, columnIndex: number | null) => {
      if (columnIndex === null) {
        return null;
      }
      return (
        <ListCell
          key={`${rowIndex}-${columnIndex}`}
          value={data.rows[rowIndex][columnIndex]}
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
          <>
            {canSelectForBulkAction && renderBulkSelectionControl(rowIndex)}
            {renderListItemCell(rowIndex, firstColumnIndex)}
            <ListCell.Root>
              <RowIconContainer>
                <Icon name="document" color={color("text-light")} />
              </RowIconContainer>
              <InfoContentContainer>
                {secondColumnIndex !== null && (
                  <ListCell.Content
                    value={data.rows[rowIndex][secondColumnIndex]}
                    data={data}
                    settings={settings}
                    columnIndex={secondColumnIndex}
                  />
                )}
                {thirdColumnIndex !== null && (
                  <ListCell.Content
                    value={data.rows[rowIndex][thirdColumnIndex]}
                    data={data}
                    settings={settings}
                    columnIndex={thirdColumnIndex}
                  />
                )}
              </InfoContentContainer>
            </ListCell.Root>
          </>
        );
      }

      return (
        <>
          {canSelectForBulkAction && renderBulkSelectionControl(rowIndex)}
          <RowIconContainer>
            <Icon name="document" color={color("text-light")} />
          </RowIconContainer>
          {left.map(columnIndex => renderListItemCell(rowIndex, columnIndex))}
        </>
      );
    },
    [
      data,
      settings,
      listColumnIndexes,
      canSelectForBulkAction,
      renderListItemCell,
      renderBulkSelectionControl,
    ],
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
        if (isSelectingItems) {
          const isSelected = bulkActions.selectedRowIndexes.includes(rowIndex);
          if (isSelected) {
            bulkActions.removeRow(rowIndex);
          } else {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            bulkActions.addRow(card.id, rowIndex);
          }
        } else {
          onVisualizationClick(clickObject);
        }
      };

      const canClick = isSelectingItems || isClickable;

      return (
        <ListItemContainer
          key={rowIndex}
          onClick={onRowClick}
          disabled={!canClick}
          ref={ref}
          data-testid="table-row"
        >
          {renderListItemLeftPart(rowIndex)}
          {right.map(columnIndex => renderListItemCell(rowIndex, columnIndex))}
        </ListItemContainer>
      );
    },
    [
      card,
      data,
      settings,
      listColumnIndexes,
      isDataApp,
      isSelectingItems,
      bulkActions,
      checkIsVisualizationClickable,
      onVisualizationClick,
      renderListItemLeftPart,
      renderListItemCell,
    ],
  );

  const getBasicVariantColumnHeaders = useCallback(() => {
    const leftColumnsCount = listColumnIndexes.left.filter(Boolean).length;
    const columnIndexes = [
      ...listColumnIndexes.left,
      ...listColumnIndexes.right,
    ];
    return columnIndexes.map((columnIndex, index) => {
      if (columnIndex === null) {
        return null;
      }
      const isLastLeft = index === leftColumnsCount - 1;
      return (
        <ColumnHeader key={columnIndex} width={isLastLeft ? "60%" : "10%"}>
          {getColumnTitle(columnIndex)}
        </ColumnHeader>
      );
    });
  }, [listColumnIndexes, getColumnTitle]);

  const getInfoVariantColumnHeaders = useCallback(() => {
    const [firstColumnIndex, secondColumnIndex, thirdColumnIndex] =
      listColumnIndexes.left;

    const cols = [];

    if (firstColumnIndex) {
      cols.push(
        <ColumnHeader key={firstColumnIndex} width="5%">
          {getColumnTitle(firstColumnIndex)}
        </ColumnHeader>,
      );
    }
    if (secondColumnIndex || thirdColumnIndex) {
      cols.push(
        <ColumnHeader
          key={`${secondColumnIndex}-${thirdColumnIndex}`}
          width="45%"
        ></ColumnHeader>,
      );
    }
    listColumnIndexes.right.forEach(columnIndex => {
      if (columnIndex === null) {
        return null;
      }
      cols.push(
        <ColumnHeader key={columnIndex} width="10%">
          {getColumnTitle(columnIndex)}
        </ColumnHeader>,
      );
    });

    return cols;
  }, [listColumnIndexes, getColumnTitle]);

  const renderColumnHeaders = useCallback(() => {
    const cols = [];

    if (canSelectForBulkAction) {
      cols.push(<ColumnHeader key="bulk-selection-control" width="1%" />);
    }

    if (listVariant === "info") {
      cols.push(...getInfoVariantColumnHeaders());
    } else {
      cols.push(...getBasicVariantColumnHeaders());
    }

    if (hasInlineActions) {
      cols.push(<ColumnHeader key="inline-actions" width="5%" />);
    }

    return cols;
  }, [
    listVariant,
    canSelectForBulkAction,
    hasInlineActions,
    getBasicVariantColumnHeaders,
    getInfoVariantColumnHeaders,
  ]);

  return (
    <>
      <Root className={className} isQueryBuilder={isQueryBuilder}>
        <div>
          <Table>
            <TableHeader>
              <tr>
                <td></td> {/* for icon alignment */}
                {renderColumnHeaders()}
              </tr>
            </TableHeader>
            <TableBody>{paginatedRowIndexes.map(renderListItem)}</TableBody>
          </Table>
        </div>
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
    </>
  );
}

export default ExplicitSize({
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  refreshMode: (props: VisualizationProps) =>
    props.isDashboard && !props.isEditing ? "debounce" : "throttle",
})(List);
