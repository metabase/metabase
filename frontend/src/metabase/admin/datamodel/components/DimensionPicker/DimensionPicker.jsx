import cx from "classnames";
import PropTypes from "prop-types";

import ListS from "metabase/css/components/list.module.css";
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
    <ul className={cx(className, CS.px2, CS.py1)} style={style}>
      {dimensions.map((d, index) => {
        const isSelected = d.isEqual(dimension);
        return (
          <DimensionListItem
            aria-selected={isSelected}
            key={index}
            data-element-id="list-item"
            className={cx(ListS.ListItem, {
              [ListS.ListItemSelected]: isSelected,
            })}
          >
            <a
              data-element-id="list-item-title"
              className={cx(
                ListS.ListItemTitle,
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
