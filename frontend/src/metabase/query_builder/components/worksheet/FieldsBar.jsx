import React from "react";
import ReactDOM from "react-dom";

import cx from "classnames";

import Icon from "metabase/components/Icon";

import DimensionDragSource from "./dnd/DimensionDragSource";

import ExplicitSize from "metabase/components/ExplicitSize";

// we're not actually using `width` from ExplicitSize but it also forces a rerender when the size changes
@ExplicitSize()
export default class FieldsBar extends React.Component {
  state = {
    maxItems: 0,
  };

  componentDidUpdate() {
    const availableWidth =
      this._barRef.offsetWidth -
      this._startRef.offsetWidth -
      this._endRef.offsetWidth;
    let totalWidth = 0;
    let maxItems = 0;
    for (const dimensionRef of this._dimensionRefs) {
      totalWidth += ReactDOM.findDOMNode(dimensionRef).offsetWidth;
      if (totalWidth > availableWidth) {
        break;
      } else {
        maxItems++;
      }
    }
    if (this.state.maxItems !== maxItems) {
      this.setState({ maxItems });
    }
  }

  renderDimension(dimension, ref) {
    return (
      <DimensionDragSource
        ref={ref}
        dimension={dimension}
        className="flex-no-shrink"
      >
        <div className="bordered rounded shadowed bg-white py1 px2 mr1 text-medium cursor-pointer text-bold">
          {<Icon size={12} name={dimension.field().icon()} className="mr1" />}
          {dimension.displayName()}
        </div>
      </DimensionDragSource>
    );
  }

  render() {
    const {
      color,
      fieldOptions,
      isPickerOpen,
      onOpenPicker,
      onClosePicker,
      extraButtons,
      alignButtonsRight,
      className,
    } = this.props;
    const { maxItems } = this.state;

    if (!fieldOptions) {
      return null;
    }

    const dimensions = fieldOptions.dimensions;

    const hasMore = dimensions.length - maxItems > 0;
    const hasFks = fieldOptions.count - dimensions.length > 0;
    const showPickerButton = hasMore || hasFks;

    this._dimensionRefs = [];

    return (
      <div
        className={cx("flex align-center mt2 align-stretch", className)}
        ref={r => (this._barRef = r)}
      >
        <div
          className="flex align-center flex-no-shrink"
          ref={r => (this._startRef = r)}
        >
          <Icon name="chevronright" className="mr2" style={{ color }} />
        </div>

        <div className="flex align-center">
          {dimensions
            .slice(0, maxItems)
            .map((dimension, index) => this.renderDimension(dimension))}
        </div>

        <div
          className={cx("flex align-center flex-no-shrink", {
            // reverse the order if hiding picker button so that it still takes up space for measurement
            "flex-reverse": !showPickerButton,
            "flex-align-right": alignButtonsRight,
          })}
          ref={r => (this._endRef = r)}
        >
          {onOpenPicker && (
            <Icon
              name="ellipsis"
              className={cx(
                "rounded cursor-pointer px1 full-height mr1",
                isPickerOpen ? "bg-brand text-white" : "bg-medium text-brand",
                { hidden: !showPickerButton },
              )}
              onClick={isPickerOpen ? onClosePicker : onOpenPicker}
            />
          )}
          {extraButtons}
        </div>

        {/* render all items to measure their widths */}
        <div className="absolute hidden flex align-center">
          {dimensions.map((dimension, index) =>
            this.renderDimension(
              dimension,
              r => (this._dimensionRefs[index] = r),
            ),
          )}
        </div>
      </div>
    );
  }
}

export const Dimension = ({ className, icon, style, children }) => (
  <div
    style={style}
    className={cx(
      className,
      "bordered rounded shadowed bg-white py1 px1 text-medium cursor-pointer text-bold",
    )}
  >
    {icon && <Icon size={12} name={icon} className="mr1" />}
    {children}
  </div>
);
