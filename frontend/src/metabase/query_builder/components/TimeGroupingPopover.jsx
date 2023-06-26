import { Component } from "react";
import PropTypes from "prop-types";

import { t } from "ttag";
import cx from "classnames";
import { DimensionListItem } from "./TimeGroupingPopover.styled";

const timeGroupingPopoverPropTypes = {
  title: PropTypes.string,
  className: PropTypes.string,
  dimension: PropTypes.object.isRequired,
  onChangeDimension: PropTypes.func.isRequired,
};

const timeGroupingPopoverDefaultProps = {
  title: t`Group time by`,
};

export default class TimeGroupingPopover extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {};
  }

  render() {
    const { title, className, dimension, onChangeDimension } = this.props;
    const subDimensions = dimension.dimensions();
    return (
      <div className={cx(className, "px2 py1")} style={{ width: "250px" }}>
        {title && <h3 className="List-section-header pt1 mx2">{title}</h3>}
        <ul className="py1">
          {subDimensions.map((subDimension, index) => {
            const isSelected = subDimension.isEqual(dimension);
            return (
              <DimensionListItem
                aria-selected={isSelected}
                key={index}
                className={cx("List-item", {
                  "List-item--selected": isSelected,
                })}
              >
                <a
                  className="List-item-title full px2 py1 cursor-pointer"
                  onClick={() => onChangeDimension(subDimension)}
                >
                  {subDimension.subDisplayName()}
                </a>
              </DimensionListItem>
            );
          })}
        </ul>
      </div>
    );
  }
}

TimeGroupingPopover.propTypes = timeGroupingPopoverPropTypes;
TimeGroupingPopover.defaultProps = timeGroupingPopoverDefaultProps;
