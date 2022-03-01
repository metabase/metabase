import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";

const propTypes = {
  style: PropTypes.object,
  className: PropTypes.string,
  dimension: PropTypes.object,
  dimensions: PropTypes.array,
  onChangeDimension: PropTypes.func.isRequired,
};

export const DimensionPicker = ({
  style,
  className,
  dimension,
  dimensions,
  onChangeDimension,
}) => {
  return (
    <ul className={cx(className, "px2 py1")} style={style}>
      {dimensions.map((d, index) => {
        const isSelected = d.isEqual(dimension);
        return (
          <li
            aria-selected={isSelected}
            key={index}
            className={cx("List-item", {
              "List-item--selected": isSelected,
            })}
          >
            <a
              className="List-item-title full px2 py1 cursor-pointer"
              onClick={() => onChangeDimension(d)}
            >
              {d.subDisplayName()}
            </a>
          </li>
        );
      })}
    </ul>
  );
};

DimensionPicker.propTypes = propTypes;
