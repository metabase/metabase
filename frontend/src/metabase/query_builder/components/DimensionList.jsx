/* @flow weak */

import React, { Component } from "react";
import _ from "underscore";
import { t } from "ttag";

import AccordionList from "metabase/components/AccordionList";
import Icon from "metabase/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Tooltip from "metabase/components/Tooltip";

import Dimension, { BinnedDimension } from "metabase-lib/lib/Dimension";

// import type { Section } from "metabase/components/AccordionList";
export type AccordionListItem = {};

export type AccordionListSection = {
  name: ?string,
  items: AccordionListItem[],
};

type Props = {
  className?: string,
  maxHeight?: number,
  width?: ?number | ?string,

  dimension?: ?Dimension,
  dimensions?: Dimension[],
  onChangeDimension: (dimension: Dimension) => void,
  onChangeOther?: (item: any) => void,

  onAddDimension?: (dimension: Dimension, item: AccordionListItem) => void,
  onRemoveDimension?: (dimension: Dimension, item: AccordionListItem) => void,

  sections: AccordionListSection[],

  alwaysExpanded?: boolean,
  enableSubDimensions?: boolean,
  useOriginalDimension?: boolean,
};

type State = {
  sections: AccordionListSection[],
};

const SUBMENU_TETHER_OPTIONS = {
  attachment: "top left",
  targetAttachment: "top right",
  targetOffset: "0 0",
  constraints: [
    {
      to: "window",
      attachment: "together",
      pin: ["left", "right"],
    },
  ],
};

export default class DimensionList extends Component {
  props: Props;
  state: State = {
    sections: [],
  };
  state: State = {
    sections: [],
  };

  componentWillMount() {
    this._updateSections(this.props.sections);
  }
  componentWillReceiveProps(nextProps) {
    if (this.props.sections !== nextProps.sections) {
      this._updateSections(nextProps.sections);
    }
  }
  _updateSections(sections) {
    this.setState({
      sections: (sections || []).map(section => ({
        ...section,
        items: section.items.map(item => ({
          ...item,
          name: item.name || (item.dimension && item.dimension.displayName()),
          icon: item.icon || (item.dimension && item.dimension.icon()),
        })),
      })),
    });
  }

  _getDimensions() {
    return (
      this.props.dimensions ||
      (this.props.dimension ? [this.props.dimension] : [])
    );
  }

  itemIsSelected = item => {
    const dimensions = this._getDimensions();
    return (
      item.dimension &&
      _.any(dimensions, d => item.dimension.isSameBaseDimension(d))
    );
  };

  renderItemExtra = (item, itemIndex, isSelected) => {
    const {
      dimension,
      enableSubDimensions,
      onAddDimension,
      onRemoveDimension,
    } = this.props;
    const subDimensions =
      enableSubDimensions && item.dimension && item.dimension.dimensions();

    const multiSelect = !!(onAddDimension || onRemoveDimension);

    return (
      <div className="Field-extra flex align-center">
        {/* {item.segment && this.renderSegmentTooltip(item.segment)} */}
        {item.dimension && item.dimension.tag && (
          <span className="h5 text-light px1">{item.dimension.tag}</span>
        )}
        {subDimensions && subDimensions.length > 0 ? (
          <PopoverWithTrigger
            className={this.props.className}
            hasArrow={false}
            triggerElement={this.renderSubDimensionTrigger(
              item.dimension,
              multiSelect,
            )}
            tetherOptions={multiSelect ? null : SUBMENU_TETHER_OPTIONS}
            sizeToFit
          >
            {({ onClose }) => (
              <DimensionPicker
                className="scroll-y"
                dimension={dimension}
                dimensions={subDimensions}
                onChangeDimension={dimension => {
                  this.props.onChangeDimension(dimension);
                  onClose();
                }}
              />
            )}
          </PopoverWithTrigger>
        ) : null}
        {!isSelected && onAddDimension && (
          <Tooltip tooltip={t`Add grouping`}>
            <Icon
              name="add"
              size={14}
              className="mx1 cursor-pointer hover-child faded fade-in-hover"
              onClick={e => {
                e.stopPropagation();
                this.handleAdd(item);
              }}
            />
          </Tooltip>
        )}
        {isSelected && onRemoveDimension && (
          <Icon
            name="close"
            className="mx1 cursor-pointer faded fade-in-hover"
            onClick={e => {
              e.stopPropagation();
              this.handleRemove(item);
            }}
          />
        )}
      </div>
    );
  };

  renderSubDimensionTrigger(otherDimension, multiSelect) {
    const dimensions = this._getDimensions();
    const subDimension =
      _.find(dimensions, d => d.isSameBaseDimension(otherDimension)) ||
      otherDimension.defaultDimension();
    const name = subDimension ? subDimension.subTriggerDisplayName() : null;
    return (
      <div className="FieldList-grouping-trigger text-white-hover flex align-center p1 cursor-pointer">
        {name && <h4>{name}</h4>}
        {!multiSelect && <Icon name="chevronright" className="ml1" size={16} />}
      </div>
    );
  }

  _getDimensionFromItem(item) {
    const { enableSubDimensions, useOriginalDimension } = this.props;
    const dimension = useOriginalDimension
      ? item.dimension
      : item.dimension.defaultDimension() || item.dimension;
    const shouldExcludeBinning =
      !enableSubDimensions &&
      !useOriginalDimension &&
      dimension instanceof BinnedDimension;

    if (shouldExcludeBinning) {
      // If we don't let user choose the sub-dimension, we don't want to treat the field
      // as a binned field (which would use the default binning)
      // Let's unwrap the base field of the binned field instead
      return dimension.baseDimension();
    } else {
      return dimension;
    }
  }

  handleChange = item => {
    const { dimension, onChangeDimension, onChangeOther } = this.props;
    if (dimension != null && this.itemIsSelected(item)) {
      // ensure if we select the same item we don't reset the subdimension
      onChangeDimension(dimension, item);
    } else if (item.dimension) {
      onChangeDimension(this._getDimensionFromItem(item), item);
    } else if (onChangeOther) {
      onChangeOther(item);
    }
  };

  handleAdd = item => {
    const d = this._getDimensionFromItem(item);
    if (d && this.props.onAddDimension) {
      this.props.onAddDimension(d, item);
    }
  };

  handleRemove = item => {
    const d = this._getDimensionFromItem(item);
    if (d && this.props.onRemoveDimension) {
      this.props.onRemoveDimension(d, item);
    }
  };

  render() {
    return (
      <AccordionList
        {...this.props}
        sections={this.state.sections}
        onChange={this.handleChange}
        itemIsSelected={this.itemIsSelected}
        renderItemExtra={this.renderItemExtra}
        getItemClassName={() => "hover-parent hover--visibility"}
      />
    );
  }
}

import cx from "classnames";

export const DimensionPicker = ({
  style,
  className,
  dimension,
  dimensions,
  onChangeDimension,
}) => {
  return (
    <ul className={cx(className, "px2 py1")} style={style}>
      {dimensions.map((d, index) => (
        <li
          key={index}
          className={cx("List-item", {
            "List-item--selected": d.isEqual(dimension),
          })}
        >
          <a
            className="List-item-title full px2 py1 cursor-pointer"
            onClick={() => onChangeDimension(d)}
          >
            {d.subDisplayName()}
          </a>
        </li>
      ))}
    </ul>
  );
};
