/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component, createRef } from "react";
import { t } from "ttag";

import { IconBorder } from "metabase/common/components/IconBorder";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting";
import { Icon } from "metabase/ui";
import { ChartSettingGoalInput } from "metabase/visualizations/components/settings/ChartSettingGoalInput";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import { isNumeric } from "metabase-lib/v1/types/utils/isa";

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

export class Progress extends Component {
  constructor(props) {
    super(props);

    this.rootRef = createRef();
    this.containerRef = createRef();
    this.labelRef = createRef();
    this.pointerRef = createRef();
    this.barRef = createRef();
  }

  static getUiName = () => t`Progress`;
  static identifier = "progress";
  static iconName = "progress";
  static minSize = getMinSize("progress");
  static defaultSize = getDefaultSize("progress");

  static getSensibility = (data) => {
    const { cols, rows } = data;
    const hasNumeric = cols.some(isNumeric);
    const isScalar = rows.length === 1 && cols.length === 1;
    const hasAggregation = cols.some(col => col.source === "aggregation");

    if (rows.length !== 1 || !hasNumeric) {
      return "nonsensible";
    }
    if (isScalar) {
      return "recommended";
    }
    if (!hasAggregation) {
      return "sensible";
    }
    return "nonsensible";
  };

  static checkRenderable([
    {
      data: { cols },
    },
  ]) {
    if (!cols.some(isNumeric)) {
      throw new Error(
        t`Progress visualization requires at least one numeric column.`,
      );
    }
  }

  static settings = {
    ...fieldSetting("progress.value", {
      get section() {
        return t`Display`;
      },
      get title() {
        return t`Value`;
      },
      fieldFilter: isNumeric,
      getDefault: ([
        {
          data: { cols },
        },
      ]) => cols.find(isNumeric)?.name || cols[0]?.name,
      getHidden: ([
        {
          data: { cols },
        },
      ]) => cols.filter(isNumeric).length <= 1,
    }),
    ...columnSettings({
      getColumns: (
        [
          {
            data: { cols },
          },
        ],
        settings,
      ) => {
        const valueField = settings["progress.value"];
        const column = findProgressColumn(cols, valueField);
        return [column || cols[0]];
      },
      readDependencies: ["progress.value"],
    }),
    "progress.goal": {
      get section() {
        return t`Display`;
      },
      get title() {
        return t`Goal`;
      },
      widget: ChartSettingGoalInput,
      default: 0,
      isValid: ([{ data }], settings) => {
        const goalSetting = settings["progress.goal"];

        if (typeof goalSetting === "number") {
          return true;
        }

        if (typeof goalSetting === "string") {
          const column = data.cols.find((col) => col.name === goalSetting);
          return !!(column && isNumeric(column));
        }

        return false;
      },
      getProps: ([{ data }], settings) => ({
        columns: data.cols,
        valueField: settings["progress.value"],
      }),
      readDependencies: ["progress.value"],
    },
    "progress.color": {
      get section() {
        return t`Display`;
      },
      get title() {
        return t`Color`;
      },
      widget: "color",
      default: color("accent1"),
    },
  };

  componentDidMount() {
    this.componentDidUpdate();
  }

  componentDidUpdate() {
    const root = this.rootRef.current;
    const pointer = this.pointerRef.current;
    const label = this.labelRef.current;
    const container = this.containerRef.current;
    const bar = this.barRef.current;

    // Safari not respecting `height: 25%` so just do it here ¯\_(ツ)_/¯
    // we have to reset height before we can calculate new height
    bar.style.height = 0;
    bar.style.height = computeBarHeight({
      cardHeight: this.props?.gridSize?.height,
      componentHeight: root.clientHeight,
      isMobile: this.props.isMobile,
    });

    // reset the pointer transform for these computations
    pointer.style.transform = null;

    // position the label
    const containerWidth = container.offsetWidth;
    const labelWidth = label.offsetWidth;
    const pointerWidth = pointer.offsetWidth;
    const pointerCenter = pointer.offsetLeft + pointerWidth / 2;
    const minOffset = -pointerWidth / 2 + BORDER_RADIUS;
    if (pointerCenter - labelWidth / 2 < minOffset) {
      label.style.left = minOffset + "px";
      label.style.right = null;
    } else if (pointerCenter + labelWidth / 2 > containerWidth - minOffset) {
      label.style.left = null;
      label.style.right = minOffset + "px";
    } else {
      label.style.left = pointerCenter - labelWidth / 2 + "px";
      label.style.right = null;
    }

    // shift pointer at ends inward to line up with border radius
    if (pointerCenter < BORDER_RADIUS) {
      pointer.style.transform = "translate(" + BORDER_RADIUS + "px,0)";
    } else if (pointerCenter > containerWidth - 5) {
      pointer.style.transform = "translate(-" + BORDER_RADIUS + "px,0)";
    }
  }

  render() {
    const {
      series: [
        {
          data: { rows, cols },
        },
      ],
      settings,
      onVisualizationClick,
      visualizationIsClickable,
    } = this.props;

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

    const handleClick = (e) => {
      const clickData = { value, column, settings, event: e.nativeEvent };
      if (onVisualizationClick && visualizationIsClickable(clickData)) {
        onVisualizationClick(clickData);
      }
    };

    return (
      <div
        ref={this.rootRef}
        className={cx(this.props.className, CS.flex, CS.layoutCentered)}
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
            ref={this.containerRef}
            className={cx(CS.relative, CS.textBold, CS.textMedium)}
            style={{ height: 20 }}
          >
            <div ref={this.labelRef} style={{ position: "absolute" }}>
              {hasValidValue
                ? formatValue(value, settings.column(column))
                : t`No data`}
            </div>
          </div>
          <div className={CS.relative} style={{ height: 10, marginBottom: 5 }}>
            <div
              ref={this.pointerRef}
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
            ref={this.barRef}
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
                ? t`Goal ${formatValue(goal, settings.column(column))}`
                : t`Goal: Not set`}
            </span>
          </div>
        </div>
      </div>
    );
  }
}

function computeBarHeight({ cardHeight, componentHeight, isMobile }) {
  if (!cardHeight) {
    return `${MAX_BAR_HEIGHT}px`;
  }

  const isSmallCard = cardHeight === Progress.minSize.height;
  if (isSmallCard && !isMobile) {
    const computedHeight =
      MIN_BAR_HEIGHT + (componentHeight - COMPONENT_HEIGHT_TO_MIN_BAR_HEIGHT);
    return `${Math.min(MAX_BAR_HEIGHT, computedHeight)}px`;
  }

  return `${MAX_BAR_HEIGHT}px`;
}
