import React, { Component } from "react";
import ReactDOM from "react-dom";
import styles from "./Legend.css";
import { t } from "ttag";
import Tooltip from "metabase/components/Tooltip";

import LegendItem from "./LegendItem";

import cx from "classnames";

export default class LegendVertical extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      overflowCount: 0,
      size: null,
    };
  }

  static propTypes = {};
  static defaultProps = {};

  componentDidUpdate(prevProps, prevState) {
    // Get the bounding rectangle of the chart widget to determine if
    // legend items will overflow the widget area
    const size = ReactDOM.findDOMNode(this).getBoundingClientRect();

    // check the height, width may flucatuate depending on the browser causing an infinite loop
    // check overflowCount, because after setting overflowCount the height changes and it causing an infinite loop too
    if (
      this.state.size &&
      size.height !== this.state.size.height &&
      prevState.overflowCount === this.state.overflowCount
    ) {
      this.setState({ overflowCount: 0, size });
    } else if (this.state.overflowCount === 0) {
      let overflowCount = 0;
      for (let i = 0; i < this.props.titles.length; i++) {
        const itemSize = ReactDOM.findDOMNode(
          this.refs["item" + i],
        ).getBoundingClientRect();
        if (size.top > itemSize.top || size.bottom < itemSize.bottom) {
          overflowCount++;
        }
      }
      if (this.state.overflowCount !== overflowCount) {
        this.setState({ overflowCount, size });
      }
    }
  }

  render() {
    const { className, titles, colors, hovered, onHoverChange } = this.props;
    const { overflowCount } = this.state;
    let items, extraItems, extraColors;
    if (overflowCount > 0) {
      items = titles.slice(0, -overflowCount - 1);
      extraItems = titles.slice(-overflowCount - 1);
      extraColors = colors
        .slice(-overflowCount - 1)
        .concat(colors.slice(0, -overflowCount - 1));
    } else {
      items = titles;
    }
    return (
      <ol
        ref="container"
        className={cx(className, styles.Legend, styles.vertical)}
      >
        {items.map((title, index) => (
          <li
            key={index}
            ref={"item" + index}
            className="flex flex-no-shrink"
            onMouseEnter={e =>
              onHoverChange &&
              onHoverChange({
                index,
                element: ReactDOM.findDOMNode(this.refs["legendItem" + index]),
              })
            }
            onMouseLeave={e => onHoverChange && onHoverChange()}
          >
            <LegendItem
              ref={"legendItem" + index}
              title={Array.isArray(title) ? title[0] : title}
              color={colors[index % colors.length]}
              isMuted={
                hovered && hovered.index != null && index !== hovered.index
              }
              showTooltip={false}
            />
            {Array.isArray(title) && (
              <span
                className={cx("LegendItem", "flex-align-right pl1", {
                  muted:
                    hovered && hovered.index != null && index !== hovered.index,
                })}
              >
                {title[1]}
              </span>
            )}
          </li>
        ))}
        {overflowCount > 0 ? (
          <li key="extra" className="flex flex-no-shrink">
            <Tooltip
              tooltip={
                <LegendVertical
                  className="p2"
                  titles={extraItems}
                  colors={extraColors}
                />
              }
            >
              <LegendItem
                title={overflowCount + 1 + " " + t`more`}
                color="gray"
                showTooltip={false}
              />
            </Tooltip>
          </li>
        ) : null}
      </ol>
    );
  }
}
