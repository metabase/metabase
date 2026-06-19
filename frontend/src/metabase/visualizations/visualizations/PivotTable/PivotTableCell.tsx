import { useDraggable } from "@dnd-kit/core";
import cx from "classnames";
import { useEffect, useId, useRef } from "react";

import CS from "metabase/css/core/index.css";
import { useTranslateContent } from "metabase/i18n/hooks";
import { Ellipsified } from "metabase/ui";
import type { VisualizationSettings } from "metabase-types/api";

import { PivotTableCell, ResizeHandle } from "./PivotTable.styled";
import { isRowCollapsed, toggleRow } from "./RowToggleIcon";
import { LEFT_HEADER_LEFT_SPACING, RESIZE_HANDLE_WIDTH } from "./constants";
import type { BodyItem, HeaderItem, PivotTableClicked } from "./types";

interface CellProps {
  value: React.ReactNode;
  style?: React.CSSProperties;
  icon?: React.ReactNode;
  backgroundColor?: string;
  isBody?: boolean;
  isCentered?: boolean;
  isBold?: boolean;
  isEmphasized?: boolean;
  isBorderedHeader?: boolean;
  isTransparent?: boolean;
  hasTopBorder?: boolean;
  isRowHovered?: boolean;
  onClick?: ((e: React.MouseEvent) => void) | undefined;
  onMouseEnter?: (() => void) | undefined;
  onResize?: (newWidth: number) => void;
  showTooltip?: boolean;
}

interface ResizableHandleProps {
  id: string;
  initialWidth: number;
  onResizeEnd: (newWidth: number) => void;
}

function ResizableHandle({
  id,
  initialWidth,
  onResizeEnd,
}: ResizableHandleProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id,
  });

  const prevTransformRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const prevTransform = prevTransformRef.current;
    prevTransformRef.current = transform;

    if (prevTransform !== null && transform === null) {
      const newWidth = Math.max(
        RESIZE_HANDLE_WIDTH,
        initialWidth + prevTransform.x,
      );
      onResizeEnd(newWidth);
    }
  }, [transform, initialWidth, onResizeEnd]);

  const currentPosition = initialWidth + (transform ? transform.x : 0);

  return (
    <ResizeHandle
      ref={setNodeRef}
      data-testid="pivot-table-resize-handle"
      style={{
        left: `${currentPosition}px`,
        cursor: "col-resize",
      }}
      {...listeners}
      {...attributes}
    />
  );
}

export function Cell({
  value,
  style,
  icon,
  backgroundColor,
  isBody = false,
  isCentered = false,
  isBold,
  isEmphasized,
  isBorderedHeader,
  isTransparent,
  hasTopBorder,
  isRowHovered,
  onClick,
  onMouseEnter,
  onResize,
  showTooltip = true,
}: CellProps) {
  const cellId = useId();

  return (
    <PivotTableCell
      data-allow-page-break-after
      data-testid="pivot-table-cell"
      isBold={isBold}
      isEmphasized={isEmphasized}
      isBorderedHeader={isBorderedHeader}
      hasTopBorder={hasTopBorder}
      isTransparent={isTransparent}
      isRowHovered={isRowHovered}
      style={{
        ...style,
        ...(backgroundColor
          ? {
              backgroundColor,
            }
          : {}),
      }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <>
        <div
          className={cx(CS.px1, CS.flex, CS.alignCenter, {
            [CS.justifyEnd]: isBody,
            [CS.justifyCenter]: isCentered,
          })}
        >
          <Ellipsified showTooltip={showTooltip}>{value}</Ellipsified>
          {icon && <div className={CS.pl1}>{icon}</div>}
        </div>
        {!!onResize && (
          <ResizableHandle
            id={`resize-handle-${cellId}`}
            initialWidth={(style?.width as number) ?? 0}
            onResizeEnd={onResize}
          />
        )}
      </>
    </PivotTableCell>
  );
}

type CellClickHandler = (
  clicked: PivotTableClicked,
) => ((e: React.MouseEvent) => void) | undefined;

interface TopHeaderCellProps {
  item: HeaderItem;
  style: React.CSSProperties;
  getCellClickHandler: CellClickHandler;
  onResize?: (newWidth: number) => void;
}

export const TopHeaderCell = ({
  item,
  style,
  getCellClickHandler,
  onResize,
}: TopHeaderCellProps) => {
  const { value, hasChildren, clicked, isSubtotal, maxDepthBelow, span } = item;

  const tc = useTranslateContent();

  return (
    <Cell
      style={{
        ...style,
      }}
      value={tc(value)}
      isBorderedHeader={maxDepthBelow === 0}
      isEmphasized={hasChildren}
      isBold={isSubtotal}
      isCentered
      onClick={getCellClickHandler(clicked)}
      onResize={span < 2 ? onResize : undefined}
    />
  );
};

type LeftHeaderCellProps = TopHeaderCellProps & {
  rowIndex: string[];
  settings: VisualizationSettings;
  onUpdateVisualizationSettings: (settings: VisualizationSettings) => void;
  isNativeQuery?: boolean;
  hoveredRowIndex?: number | null;
  onRowHover?: (rowIndex: number) => void;
};

export const LeftHeaderCell = ({
  item,
  style,
  getCellClickHandler,
  rowIndex,
  settings,
  onUpdateVisualizationSettings,
  onResize,
  isNativeQuery,
  hoveredRowIndex,
  onRowHover,
}: LeftHeaderCellProps) => {
  const { value, isSubtotal, hasSubtotal, depth, path, clicked, span, offset } =
    item;

  // This header cell spans body rows [offset, offset + span). Highlight it when
  // the hovered body row falls within that range, syncing the left header's
  // hover guide with the body grid's.
  const isRowHovered =
    hoveredRowIndex != null &&
    hoveredRowIndex >= offset &&
    hoveredRowIndex < offset + span;

  // Rows that can be collapsed: subtotal rows, rows with subtotals, or native
  // depth-0 rows that span multiple children.
  const isToggleable =
    isSubtotal || hasSubtotal || (isNativeQuery && depth === 0 && span > 1);

  const collapsed =
    isToggleable && path != null ? isRowCollapsed(path, settings) : false;

  const handleClick =
    isToggleable && path != null
      ? (e: React.MouseEvent) => {
          e.stopPropagation();
          toggleRow({
            value: path,
            settings,
            updateSettings: onUpdateVisualizationSettings,
            rowIndex,
          });
        }
      : getCellClickHandler(clicked);

  return (
    <Cell
      style={{
        ...style,
        ...(depth === 0 ? { paddingLeft: LEFT_HEADER_LEFT_SPACING } : {}),
        ...(isToggleable ? { cursor: "pointer" } : {}),
      }}
      value={value}
      isEmphasized={isSubtotal || collapsed}
      isBold={isSubtotal}
      isRowHovered={isRowHovered}
      onClick={handleClick}
      onResize={onResize}
      onMouseEnter={onRowHover ? () => onRowHover(offset) : undefined}
    />
  );
};

interface BodyCellProps {
  style: React.CSSProperties;
  rowSection: BodyItem[];
  getCellClickHandler: CellClickHandler;
  cellWidths: number[];
  showTooltip?: boolean;
  isRowHovered?: boolean;
  onRowHover?: () => void;
  onRowHoverEnd?: () => void;
}

export const BodyCell = ({
  style,
  rowSection,
  getCellClickHandler,
  cellWidths,
  showTooltip = true,
  isRowHovered = false,
  onRowHover,
  onRowHoverEnd,
}: BodyCellProps) => {
  return (
    <div
      style={style}
      className={CS.flex}
      onMouseEnter={onRowHover}
      onMouseLeave={onRowHoverEnd}
    >
      {rowSection.map(
        ({ value, isSubtotal, clicked, backgroundColor }, index) => {
          return (
            <Cell
              key={index}
              style={{
                flexBasis: cellWidths[index],
              }}
              value={value}
              isEmphasized={isSubtotal}
              isBold={isSubtotal}
              showTooltip={showTooltip}
              isBody
              isRowHovered={isRowHovered}
              onClick={getCellClickHandler(clicked)}
              backgroundColor={backgroundColor}
            />
          );
        },
      )}
    </div>
  );
};
