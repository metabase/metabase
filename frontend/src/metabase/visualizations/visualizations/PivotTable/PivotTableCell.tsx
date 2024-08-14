import cx from "classnames";
import type * as React from "react";
import type { ControlPosition, DraggableBounds } from "react-draggable";
import Draggable from "react-draggable";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import CS from "metabase/css/core/index.css";
import type { VisualizationSettings } from "metabase-types/api";

import { PivotTableCell, ResizeHandle } from "./PivotTable.styled";
import { RowToggleIcon } from "./RowToggleIcon";
import { LEFT_HEADER_LEFT_SPACING, RESIZE_HANDLE_WIDTH } from "./constants";
import type { HeaderItem, BodyItem, PivotTableClicked } from "./types";

interface CellProps {
  value: React.ReactNode;
  style?: React.CSSProperties;
  icon?: React.ReactNode;
  backgroundColor?: string;
  isBody?: boolean;
  isBold?: boolean;
  isEmphasized?: boolean;
  isNightMode?: boolean;
  isBorderedHeader?: boolean;
  isTransparent?: boolean;
  hasTopBorder?: boolean;
  onClick?: ((e: React.SyntheticEvent) => void) | undefined;
  onResize?: (newWidth: number) => void;
}

interface CellProps {
  value: React.ReactNode;
  style?: React.CSSProperties;
  icon?: React.ReactNode;
  backgroundColor?: string;
  isBody?: boolean;
  isBold?: boolean;
  isEmphasized?: boolean;
  isNightMode?: boolean;
  isBorderedHeader?: boolean;
  isTransparent?: boolean;
  hasTopBorder?: boolean;
  onClick?: ((e: React.SyntheticEvent) => void) | undefined;
  onResize?: (newWidth: number) => void;
  showTooltip?: boolean;
}

export function Cell({
  value,
  style,
  icon,
  backgroundColor,
  isBody = false,
  isBold,
  isEmphasized,
  isNightMode,
  isBorderedHeader,
  isTransparent,
  hasTopBorder,
  onClick,
  onResize,
  showTooltip = true,
}: CellProps) {
  return (
    <PivotTableCell
      data-testid="pivot-table-cell"
      isNightMode={isNightMode}
      isBold={isBold}
      isEmphasized={isEmphasized}
      isBorderedHeader={isBorderedHeader}
      hasTopBorder={hasTopBorder}
      isTransparent={isTransparent}
      style={{
        ...style,
        ...(backgroundColor
          ? {
              backgroundColor,
            }
          : {}),
      }}
      onClick={onClick}
    >
      <>
        <div
          className={cx(CS.px1, CS.flex, CS.alignCenter, {
            [CS.justifyEnd]: isBody,
          })}
        >
          <Ellipsified showTooltip={showTooltip}>{value}</Ellipsified>
          {icon && <div className={CS.pl1}>{icon}</div>}
        </div>
        {!!onResize && (
          <Draggable
            axis="x"
            enableUserSelectHack
            bounds={{ left: RESIZE_HANDLE_WIDTH } as DraggableBounds}
            position={
              {
                x: style?.width ?? 0,
                y: 0,
              } as ControlPosition
            }
            onStop={(e, { x }) => {
              onResize(x);
            }}
          >
            <ResizeHandle data-testid="pivot-table-resize-handle" />
          </Draggable>
        )}
      </>
    </PivotTableCell>
  );
}

type CellClickHandler = (
  clicked: PivotTableClicked,
) => ((e: React.SyntheticEvent) => void) | undefined;

interface TopHeaderCellProps {
  item: HeaderItem;
  style: React.CSSProperties;
  isNightMode: boolean;
  getCellClickHandler: CellClickHandler;
  onResize?: (newWidth: number) => void;
}

export const TopHeaderCell = ({
  item,
  style,
  isNightMode,
  getCellClickHandler,
  onResize,
}: TopHeaderCellProps) => {
  const { value, hasChildren, clicked, isSubtotal, maxDepthBelow, span } = item;

  return (
    <Cell
      style={{
        ...style,
      }}
      value={value}
      isNightMode={isNightMode}
      isBorderedHeader={maxDepthBelow === 0}
      isEmphasized={hasChildren}
      isBold={isSubtotal}
      onClick={getCellClickHandler(clicked)}
      onResize={span < 2 ? onResize : undefined}
    />
  );
};

type LeftHeaderCellProps = TopHeaderCellProps & {
  rowIndex: string[];
  settings: VisualizationSettings;
  onUpdateVisualizationSettings: (settings: VisualizationSettings) => void;
};

export const LeftHeaderCell = ({
  item,
  style,
  isNightMode,
  getCellClickHandler,
  rowIndex,
  settings,
  onUpdateVisualizationSettings,
  onResize,
}: LeftHeaderCellProps) => {
  const { value, isSubtotal, hasSubtotal, depth, path, clicked } = item;

  return (
    <Cell
      style={{
        ...style,
        ...(depth === 0 ? { paddingLeft: LEFT_HEADER_LEFT_SPACING } : {}),
      }}
      isNightMode={isNightMode}
      value={value}
      isEmphasized={isSubtotal}
      isBold={isSubtotal}
      onClick={getCellClickHandler(clicked)}
      onResize={onResize}
      icon={
        (isSubtotal || hasSubtotal) && (
          <RowToggleIcon
            data-testid={`${item.rawValue}-toggle-button`}
            value={path}
            settings={settings}
            updateSettings={onUpdateVisualizationSettings}
            hideUnlessCollapsed={isSubtotal}
            rowIndex={rowIndex} // used to get a list of "other" paths when open one item in a collapsed column
          />
        )
      }
    />
  );
};

interface BodyCellProps {
  style: React.CSSProperties;
  rowSection: BodyItem[];
  isNightMode: boolean;
  getCellClickHandler: CellClickHandler;
  cellWidths: number[];
  showTooltip?: boolean;
}

export const BodyCell = ({
  style,
  rowSection,
  isNightMode,
  getCellClickHandler,
  cellWidths,
  showTooltip = true,
}: BodyCellProps) => {
  return (
    <div style={style} className={CS.flex}>
      {rowSection.map(
        ({ value, isSubtotal, clicked, backgroundColor }, index) => (
          <Cell
            isNightMode={isNightMode}
            key={index}
            style={{
              flexBasis: cellWidths[index],
            }}
            value={value}
            isEmphasized={isSubtotal}
            isBold={isSubtotal}
            showTooltip={showTooltip}
            isBody
            onClick={getCellClickHandler(clicked)}
            backgroundColor={backgroundColor}
          />
        ),
      )}
    </div>
  );
};
