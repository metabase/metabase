/* eslint-disable react/prop-types */
/* eslint-disable react/no-string-refs */
import cx from "classnames";
import { Component } from "react";
import ReactDOM from "react-dom";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Popover } from "metabase/ui";

import LegendS from "./Legend.module.css";
import LegendItem from "./LegendItem";

export default class LegendVertical extends Component {
  static propTypes = {};
  static defaultProps = {};

  state = {
    overflowCount: 0,
    size: null,
  };

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
    const {
      className,
      titles,
      colors,
      hovered,
      hiddenIndices = [],
      onHoverChange,
      onToggleSeriesVisibility,
    } = this.props;
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
      <ol className={cx(className, LegendS.Legend, LegendS.vertical)}>
        {items.map((title, index) => {
          const isMuted =
            hovered && hovered.index != null && index !== hovered.index;
          const legendItemTitle = Array.isArray(title) ? title[0] : title;
          const isVisible = !hiddenIndices.includes(index);

          const handleMouseEnter = () => {
            onHoverChange?.({
              index,
              element: ReactDOM.findDOMNode(this.refs["legendItem" + index]),
            });
          };

          const handleMouseLeave = () => {
            onHoverChange?.();
          };

          return (
            <li
              key={index}
              ref={"item" + index}
              className={cx(CS.flex, CS.flexNoShrink)}
              onMouseEnter={e => {
                if (isVisible) {
                  handleMouseEnter();
                }
              }}
              onMouseLeave={handleMouseLeave}
              data-testid={`legend-item-${legendItemTitle}`}
              {...(hovered && { "aria-current": !isMuted })}
            >
              <LegendItem
                ref={"legendItem" + index}
                title={legendItemTitle}
                color={colors[index % colors.length]}
                isMuted={isMuted}
                isVisible={isVisible}
                showTooltip={false}
                onToggleSeriesVisibility={event => {
                  if (isVisible) {
                    handleMouseLeave();
                  } else {
                    handleMouseEnter();
                  }
                  onToggleSeriesVisibility(event, index);
                }}
              />
              {Array.isArray(title) && (
                <span
                  className={cx(
                    LegendS.LegendItem,
                    CS.flex,
                    CS.alignCenter,
                    CS.flexAlignRight,
                    CS.pl1,
                    { [LegendS.LegendItemMuted]: isMuted },
                  )}
                >
                  {title[1]}
                </span>
              )}
            </li>
          );
        })}
        {overflowCount > 0 ? (
          <Popover>
            <Popover.Target>
              <li className={cx(CS.flex, CS.flexNoShrink, CS.cursorPointer)}>
                <LegendItem
                  title={overflowCount + 1 + " " + t`more`}
                  color="gray"
                  showTooltip={false}
                />
              </li>
            </Popover.Target>
            <Popover.Dropdown>
              <LegendVertical
                className={CS.p2}
                titles={extraItems}
                colors={extraColors}
                hiddenIndices={hiddenIndices
                  .filter(i => i >= items.length - 1)
                  .map(i => i - items.length)}
                onToggleSeriesVisibility={(event, sliceIndex) =>
                  onToggleSeriesVisibility(event, sliceIndex + items.length)
                }
              />
            </Popover.Dropdown>
          </Popover>
        ) : null}
      </ol>
    );
  }
}
