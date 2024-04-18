/* eslint-disable react/prop-types */
import cx from "classnames";
import Color from "color";
import { createRef, Component } from "react";
import ReactDOM from "react-dom";
import { t } from "ttag";
import _ from "underscore";

import IconBorder from "metabase/components/IconBorder";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting";
import { Icon } from "metabase/ui";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import { isNumeric } from "metabase-lib/v1/types/utils/isa";

import { getValue } from "./utils";

const BORDER_RADIUS = 5;
const MAX_BAR_HEIGHT = 65;
const MIN_BAR_HEIGHT = 30;
const COMPONENT_HEIGHT_TO_MIN_BAR_HEIGHT = 99;

export default class Progress extends Component {
  constructor(props) {
    super(props);

    this.containerRef = createRef();
    this.labelRef = createRef();
    this.pointerRef = createRef();
    this.barRef = createRef();
  }

  static uiName = t`Progress`;
  static identifier = "progress";
  static iconName = "progress";

  static minSize = getMinSize("progress");
  static defaultSize = getDefaultSize("progress");

  static isSensible({ cols, rows }) {
    return rows.length === 1 && cols.length === 1;
  }

  static checkRenderable([
    {
      data: { cols, rows },
    },
  ]) {
    if (!isNumeric(cols[0])) {
      throw new Error(t`Progress visualization requires a number.`);
    }
  }

  static settings = {
    ...columnSettings({
      getColumns: (
        [
          {
            data: { cols },
          },
        ],
        settings,
      ) => [
        _.find(cols, col => col.name === settings["scalar.field"]) || cols[0],
      ],
    }),
    "progress.goal": {
      section: t`Display`,
      title: t`Goal`,
      widget: "number",
      default: 0,
    },
    "progress.color": {
      section: t`Display`,
      title: t`Color`,
      widget: "color",
      default: color("accent1"),
    },
  };

  componentDidMount() {
    this.componentDidUpdate();
  }

  componentDidUpdate() {
    const component = ReactDOM.findDOMNode(this);
    const pointer = this.pointerRef.current;
    const label = this.labelRef.current;
    const container = this.containerRef.current;
    const bar = this.barRef.current;

    // Safari not respecting `height: 25%` so just do it here ¯\_(ツ)_/¯
    // we have to reset height before we can calculate new height
    bar.style.height = 0;
    bar.style.height = computeBarHeight({
      cardHeight: this.props?.gridSize?.height,
      componentHeight: component.clientHeight,
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

    const value = getValue(rows);
    const column = cols[0];
    const goal = settings["progress.goal"] || 0;

    const mainColor = settings["progress.color"];
    const lightColor = Color(mainColor).lighten(0.25).rgb().string();
    const darkColor = Color(mainColor).darken(0.3).rgb().string();

    const progressColor = mainColor;
    const restColor = value > goal ? darkColor : lightColor;
    const arrowColor = value > goal ? darkColor : mainColor;

    const barPercent = Math.max(0, value < goal ? value / goal : goal / value);
    const arrowPercent = Math.max(0, value < goal ? value / goal : 1);

    let barMessage;
    if (value === goal) {
      barMessage = t`Goal met`;
    } else if (value > goal) {
      barMessage = t`Goal exceeded`;
    }

    const clicked = { value, column, settings };
    const isClickable = onVisualizationClick != null;

    const handleClick = e => {
      if (onVisualizationClick && visualizationIsClickable(clicked)) {
        onVisualizationClick({ ...clicked, event: e.nativeEvent });
      }
    };

    return (
      <div className={cx(this.props.className, CS.flex, CS.layoutCentered)}>
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
              {formatValue(value, settings.column(column))}
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
            <span className={CS.floatRight}>{t`Goal ${formatValue(
              goal,
              settings.column(column),
            )}`}</span>
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
