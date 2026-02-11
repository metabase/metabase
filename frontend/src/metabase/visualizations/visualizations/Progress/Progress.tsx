import cx from "classnames";
import { type MouseEvent, useCallback, useEffect, useRef } from "react";
import { t } from "ttag";

import { IconBorder } from "metabase/common/components/IconBorder";
import CS from "metabase/css/core/index.css";
import { formatValue } from "metabase/lib/formatting";
import { Icon } from "metabase/ui";
import type { VisualizationProps } from "metabase/visualizations/types";

import { PROGRESS_CHART_DEFINITION } from "./chart-definition";
import {
  calculateProgressMetrics,
  extractProgressValue,
  findProgressColumn,
  getGoalValue,
  getProgressColors,
  getProgressMessage,
} from "./utils";

const BORDER_RADIUS = 5;
const MAX_BAR_HEIGHT = 65;
const MIN_BAR_HEIGHT = 30;
const COMPONENT_HEIGHT_TO_MIN_BAR_HEIGHT = 99;

Object.assign(Progress, PROGRESS_CHART_DEFINITION);

export function Progress(props: VisualizationProps) {
  const {
    className,
    isMobile,
    series: [
      {
        data: { rows, cols },
      },
    ],
    settings,
    onVisualizationClick,
    visualizationIsClickable,
  } = props;

  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const valueField = settings["progress.value"];
  const column = findProgressColumn(cols, valueField);
  const columnIndex = column
    ? cols.findIndex((col) => col.name === column.name)
    : -1;

  const value = extractProgressValue(rows, columnIndex);
  const goal = getGoalValue(settings["progress.goal"], cols, rows);

  const metrics = calculateProgressMetrics(value, goal);
  const { hasValidValue, hasValidGoal, barPercent, arrowPercent } = metrics;

  const mainColor = settings["progress.color"];
  const colors = getProgressColors(mainColor, value, goal);
  const progressColor = colors.foreground;
  const restColor = colors.background;
  const arrowColor = colors.pointer;

  const barMessage = getProgressMessage(metrics);

  const isClickable = onVisualizationClick != null;

  const columnSettings = column && settings.column && settings.column(column);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const clickData = { value, column, settings, event: event.nativeEvent };
    if (onVisualizationClick && visualizationIsClickable(clickData)) {
      onVisualizationClick(clickData);
    }
  };

  const cardHeight = props?.gridSize?.height;

  const update = useCallback(() => {
    const root = rootRef.current;
    const pointer = pointerRef.current;
    const label = labelRef.current;
    const container = containerRef.current;
    const bar = barRef.current;

    if (!bar || !root || !pointer || !container || !label) {
      return;
    }

    // Safari not respecting `height: 25%` so just do it here ¯\_(ツ)_/¯
    // we have to reset height before we can calculate new height
    bar.style.height = "0px";
    bar.style.height = computeBarHeight({
      cardHeight,
      componentHeight: root.clientHeight,
      isMobile,
    });

    // reset the pointer transform for these computations
    pointer.style.transform = "";

    // position the label
    const containerWidth = container.offsetWidth;
    const labelWidth = label.offsetWidth;
    const pointerWidth = pointer.offsetWidth;
    const pointerCenter = pointer.offsetLeft + pointerWidth / 2;
    const minOffset = -pointerWidth / 2 + BORDER_RADIUS;
    if (pointerCenter - labelWidth / 2 < minOffset) {
      label.style.left = minOffset + "px";
      label.style.right = "";
    } else if (pointerCenter + labelWidth / 2 > containerWidth - minOffset) {
      label.style.left = "";
      label.style.right = minOffset + "px";
    } else {
      label.style.left = pointerCenter - labelWidth / 2 + "px";
      label.style.right = "";
    }

    // shift pointer at ends inward to line up with border radius
    if (pointerCenter < BORDER_RADIUS) {
      pointer.style.transform = "translate(" + BORDER_RADIUS + "px,0)";
    } else if (pointerCenter > containerWidth - 5) {
      pointer.style.transform = "translate(-" + BORDER_RADIUS + "px,0)";
    }
  }, [cardHeight, isMobile]);

  useEffect(() => {
    update();
  });

  return (
    <div
      ref={rootRef}
      className={cx(className, CS.flex, CS.layoutCentered)}
      data-testid="progress-bar-root"
    >
      <div
        className={cx(
          CS.flexFull,
          CS.fullHeight,
          CS.flex,
          CS.flexColumn,
          CS.justifyCenter,
        )}
        style={{ padding: 10, paddingTop: 0 }}
      >
        <div
          ref={containerRef}
          className={cx(CS.relative, CS.textBold, CS.textMedium)}
          style={{ height: 20 }}
        >
          <div ref={labelRef} style={{ position: "absolute" }}>
            {hasValidValue ? formatValue(value, columnSettings) : t`No data`}
          </div>
        </div>
        <div className={CS.relative} style={{ height: 10, marginBottom: 5 }}>
          <div
            ref={pointerRef}
            style={{
              width: 0,
              height: 0,
              position: "absolute",
              left: arrowPercent * 100 + "%",
              marginLeft: -10,
              borderLeft: "10px solid transparent",
              borderRight: "10px solid transparent",
              borderTop: "10px solid " + arrowColor,
            }}
          />
        </div>
        <div
          ref={barRef}
          className={cx(CS.relative, { [CS.cursorPointer]: isClickable })}
          style={{
            backgroundColor: restColor,
            borderRadius: BORDER_RADIUS,
            overflow: "hidden",
          }}
          data-testid="progress-bar"
          onClick={handleClick}
        >
          <div
            style={{
              backgroundColor: progressColor,
              width: barPercent * 100 + "%",
              height: "100%",
            }}
          />
          {barMessage && (
            <div
              className={cx(
                CS.flex,
                CS.alignCenter,
                CS.absolute,
                CS.spread,
                CS.textWhite,
                CS.textBold,
                CS.px2,
              )}
            >
              <IconBorder borderWidth={2}>
                <Icon name="check" />
              </IconBorder>
              <div className={CS.pl2}>{barMessage}</div>
            </div>
          )}
        </div>
        <div className={CS.mt1}>
          <span className={CS.floatLeft}>0</span>
          <span className={CS.floatRight}>
            {hasValidGoal
              ? t`Goal ${formatValue(goal, columnSettings)}`
              : t`Goal: Not set`}
          </span>
        </div>
      </div>
    </div>
  );
}

function computeBarHeight({
  cardHeight,
  componentHeight,
  isMobile,
}: {
  cardHeight: number | undefined;
  componentHeight: number;
  isMobile: boolean;
}) {
  if (!cardHeight) {
    return `${MAX_BAR_HEIGHT}px`;
  }

  const isSmallCard = cardHeight === PROGRESS_CHART_DEFINITION.minSize.height;
  if (isSmallCard && !isMobile) {
    const computedHeight =
      MIN_BAR_HEIGHT + (componentHeight - COMPONENT_HEIGHT_TO_MIN_BAR_HEIGHT);
    return `${Math.min(MAX_BAR_HEIGHT, computedHeight)}px`;
  }

  return `${MAX_BAR_HEIGHT}px`;
}
