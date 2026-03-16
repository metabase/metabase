import { useDraggable } from "@dnd-kit/core";
import cx from "classnames";
import { useEffect, useId, useRef } from "react";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import CS from "metabase/css/core/index.css";
import { useTranslateContent } from "metabase/i18n/hooks";
import { formatUrl } from "metabase/lib/formatting/url";
import type { VisualizationSettings } from "metabase-types/api";

import { PivotTableCell, ResizeHandle } from "./PivotTable.styled";
import { RowToggleIcon } from "./RowToggleIcon";
import { LEFT_HEADER_LEFT_SPACING, RESIZE_HANDLE_WIDTH } from "./constants";
import type { BodyItem, HeaderItem, PivotTableClicked } from "./types";

interface CellProps {
  value: React.ReactNode;
  style?: React.CSSProperties;
  icon?: React.ReactNode;
  backgroundColor?: string;
  isBody?: boolean;
  isBold?: boolean;
  isEmphasized?: boolean;
  isBorderedHeader?: boolean;
  isTransparent?: boolean;
  hasTopBorder?: boolean;
  onClick?: ((e: React.MouseEvent) => void) | undefined;
  onResize?: (newWidth: number) => void;
  showTooltip?: boolean;
  isDashboardLink?: boolean;
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
  isBold,
  isEmphasized,
  isBorderedHeader,
  isTransparent,
  hasTopBorder,
  onClick,
  onResize,
  showTooltip = true,
  isDashboardLink = false,
}: CellProps) {
  const cellId = useId();

  const displayValue = isDashboardLink ? (
    <span
      className={cx(CS.textBrand)}
      style={{ cursor: "pointer", textDecoration: "none" }}
      onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
      onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
    >
      {value}
    </span>
  ) : (
    value
  );

  return (
    <PivotTableCell
      data-allow-page-break-after
      data-testid="pivot-table-cell"
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
          <Ellipsified showTooltip={showTooltip}>{displayValue}</Ellipsified>
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

function hydrateClicked(clicked: any, columns: any[]) {
  if (!clicked || !columns) {
    return clicked;
  }
  const hydrated = { ...clicked };

  if (typeof hydrated.colIdx === "number") {
    hydrated.column = columns[hydrated.colIdx];
    if (!hydrated.data) {
      hydrated.data = [
        { value: hydrated.value, col: columns[hydrated.colIdx] },
      ];
    }
  }

  if (hydrated.data) {
    hydrated.data = hydrated.data.map((item: any) => ({
      ...item,
      col: item.colIdx !== undefined ? columns[item.colIdx] : item.col,
    }));
  }

  if (hydrated.dimensions) {
    hydrated.dimensions = hydrated.dimensions.map((item: any) => ({
      ...item,
      col: item.colIdx !== undefined ? columns[item.colIdx] : item.col,
    }));
  }

  return hydrated;
}

function getCellLinkData(hydratedClicked: any, settings: any) {
  try {
    if (!hydratedClicked || !settings) {
      return {
        colSettings: null,
        isExplicitLink: false,
        hasClickBehavior: false,
        col: null,
      };
    }

    const col = hydratedClicked.column;

    if (!col) {
      return {
        colSettings: null,
        isExplicitLink: false,
        hasClickBehavior: false,
        col: null,
      };
    }

    const colSettings = settings.column(col) || {};

    const hasClickBehavior =
      colSettings.click_behavior &&
      colSettings.click_behavior.type &&
      colSettings.click_behavior.type !== "none";
    const isExplicitLink =
      (colSettings.view_as === "link" ||
        colSettings.view_as === "email_link") &&
      (colSettings.link_url || colSettings.link_text);

    return { colSettings, isExplicitLink, hasClickBehavior, col };
  } catch (e) {
    return {
      colSettings: null,
      isExplicitLink: false,
      hasClickBehavior: false,
      col: null,
    };
  }
}

interface TopHeaderCellProps {
  item: HeaderItem;
  style: React.CSSProperties;
  getCellClickHandler: CellClickHandler;
  onResize?: (newWidth: number) => void;
  settings?: VisualizationSettings;
  columns?: any[];
}

export const TopHeaderCell = ({
  item,
  style,
  getCellClickHandler,
  onResize,
  settings,
  columns = [],
}: TopHeaderCellProps) => {
  const { value, hasChildren, clicked, isSubtotal, maxDepthBelow, span } = item;

  const tc = useTranslateContent();

  const hydratedClicked = hydrateClicked(clicked, columns);
  const { colSettings, isExplicitLink, hasClickBehavior, col } =
    getCellLinkData(hydratedClicked, settings);

  let finalValue: React.ReactNode = tc(value);
  let finalOnClick = getCellClickHandler(clicked);

  if (isExplicitLink && value !== null && value !== undefined) {
    finalValue = formatUrl(String(value), {
      jsx: true,
      rich: true,
      view_as: colSettings.view_as,
      link_url: colSettings.link_url,
      link_text: colSettings.link_text,
      column: col,
      clicked: hydratedClicked,
    });
    finalOnClick = undefined;
  }

  return (
    <Cell
      style={{
        ...style,
      }}
      value={finalValue}
      isBorderedHeader={maxDepthBelow === 0}
      isEmphasized={hasChildren}
      isBold={isSubtotal}
      onClick={finalOnClick}
      onResize={span < 2 ? onResize : undefined}
      isDashboardLink={hasClickBehavior && !isExplicitLink}
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
  getCellClickHandler,
  rowIndex,
  settings,
  onUpdateVisualizationSettings,
  onResize,
  columns = [],
}: LeftHeaderCellProps) => {
  const { value, isSubtotal, hasSubtotal, depth, path, clicked } = item;

  const hydratedClicked = hydrateClicked(clicked, columns);
  const { colSettings, isExplicitLink, hasClickBehavior, col } =
    getCellLinkData(hydratedClicked, settings);

  let finalValue: React.ReactNode = value;
  let finalOnClick = getCellClickHandler(clicked);

  if (isExplicitLink && value !== null && value !== undefined) {
    finalValue = formatUrl(String(value), {
      jsx: true,
      rich: true,
      view_as: colSettings.view_as,
      link_url: colSettings.link_url,
      link_text: colSettings.link_text,
      column: col,
      clicked: hydratedClicked,
    });
    finalOnClick = undefined;
  }

  return (
    <Cell
      style={{
        ...style,
        ...(depth === 0 ? { paddingLeft: LEFT_HEADER_LEFT_SPACING } : {}),
      }}
      value={finalValue}
      isEmphasized={isSubtotal}
      isBold={isSubtotal}
      onClick={finalOnClick}
      onResize={onResize}
      isDashboardLink={hasClickBehavior && !isExplicitLink}
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
  getCellClickHandler: CellClickHandler;
  cellWidths: number[];
  showTooltip?: boolean;
  settings?: VisualizationSettings;
  columns?: any[];
}

export const BodyCell = ({
  style,
  rowSection,
  getCellClickHandler,
  cellWidths,
  showTooltip = true,
  settings,
  columns = [],
}: BodyCellProps) => {
  return (
    <div style={style} className={CS.flex}>
      {rowSection.map(
        ({ value, isSubtotal, clicked, backgroundColor }, index) => {
          const hydratedClicked = hydrateClicked(clicked, columns);
          const { colSettings, isExplicitLink, hasClickBehavior, col } =
            getCellLinkData(hydratedClicked, settings);

          let finalValue: React.ReactNode = value;
          let finalOnClick = getCellClickHandler(clicked);

          if (isExplicitLink && value !== null && value !== undefined) {
            finalValue = formatUrl(String(value), {
              jsx: true,
              rich: true,
              view_as: colSettings.view_as,
              link_url: colSettings.link_url,
              link_text: colSettings.link_text,
              column: col,
              clicked: hydratedClicked,
            });
            finalOnClick = undefined;
          }

          return (
            <Cell
              key={index}
              style={{
                flexBasis: cellWidths[index],
              }}
              value={finalValue}
              isEmphasized={isSubtotal}
              isBold={isSubtotal}
              showTooltip={showTooltip}
              isBody
              onClick={finalOnClick}
              backgroundColor={backgroundColor}
              isDashboardLink={hasClickBehavior && !isExplicitLink}
            />
          );
        },
      )}
    </div>
  );
};
