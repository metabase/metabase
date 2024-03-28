import cx from "classnames";
import PropTypes from "prop-types";

import CS from "metabase/css/core/index.css";

import { DimensionListItem } from "./DimensionPicker.styled";

const propTypes = {
  style: PropTypes.object,
  className: PropTypes.string,
  dimension: PropTypes.object,
  dimensions: PropTypes.array,
  onChangeDimension: PropTypes.func.isRequired,
};

/**
 * @deprecated use MLv2
 */
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
          <DimensionListItem
            aria-selected={isSelected}
            key={index}
            className={cx("List-item", {
              "List-item--selected": isSelected,
            })}
          >
            <a
              className={cx(
                "List-item-title",
                CS.full,
                CS.px2,
                CS.py1,
                CS.cursorPointer,
              )}
              onClick={() => onChangeDimension(d)}
            >
              {d.subDisplayName()}
            </a>
          </DimensionListItem>
        );
      })}
    </ul>
  );
};

DimensionPicker.propTypes = propTypes;
