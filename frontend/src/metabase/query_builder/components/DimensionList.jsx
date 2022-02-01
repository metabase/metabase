/* eslint-disable react/prop-types */
import React, { Component } from "react";
import _ from "underscore";
import { t } from "ttag";

import AccordionList from "metabase/core/components/AccordionList";
import Icon from "metabase/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Tooltip from "metabase/components/Tooltip";

import { FieldDimension } from "metabase-lib/lib/Dimension";
import { DimensionPicker } from "./DimensionPicker";

const SUBMENU_TETHER_OPTIONS = {
  attachment: "top left",
  targetAttachment: "top right",
  targetOffset: "0 0",
  constraints: [
    {
      to: "window",
      attachment: "together",
      pin: true,
    },
  ],
};

export default class DimensionList extends Component {
  state = {
    sections: [],
  };

  UNSAFE_componentWillMount() {
    this._updateSections(this.props.sections);
  }
  UNSAFE_componentWillReceiveProps(nextProps) {
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
      preventNumberSubDimensions,
      onAddDimension,
      onRemoveDimension,
    } = this.props;

    const surpressSubDimensions =
      preventNumberSubDimensions && item.dimension.field().isSummable();

    const subDimensions =
      enableSubDimensions &&
      item.dimension &&
      // Do not display sub dimension if this is an FK (metabase#16787)
      !item.dimension.field().isFK() &&
      !surpressSubDimensions &&
      item.dimension.dimensions();

    const multiSelect = !!(onAddDimension || onRemoveDimension);

    const sectionDimension = dimension
      ? dimension
      : _.find(
          this._getDimensions(),
          d => d.field() === item.dimension.field(),
        );

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
              preventNumberSubDimensions,
            )}
            tetherOptions={multiSelect ? null : SUBMENU_TETHER_OPTIONS}
            sizeToFit
          >
            {({ onClose }) => (
              <DimensionPicker
                className="scroll-y"
                dimension={sectionDimension}
                dimensions={subDimensions}
                onChangeDimension={dimension => {
                  this.props.onChangeDimension(dimension, {
                    isSubDimension: true,
                  });
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
      <div
        className="FieldList-grouping-trigger text-white-hover flex align-center p1 cursor-pointer"
        data-testid="dimension-list-item-binning"
      >
        {name && <h4>{name}</h4>}
        {!multiSelect && <Icon name="chevronright" className="ml1" size={16} />}
      </div>
    );
  }

  _getDimensionFromItem(item) {
    const {
      enableSubDimensions,
      useOriginalDimension,
      preventNumberSubDimensions,
    } = this.props;
    const dimension = useOriginalDimension
      ? item.dimension
      : item.dimension.defaultDimension() || item.dimension;
    const shouldExcludeBinning =
      !enableSubDimensions &&
      !useOriginalDimension &&
      dimension instanceof FieldDimension &&
      dimension.binningStrategy();

    if (
      shouldExcludeBinning ||
      (preventNumberSubDimensions && dimension.field().isSummable())
    ) {
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
        itemTestId="dimension-list-item"
        sections={this.state.sections}
        onChange={this.handleChange}
        itemIsSelected={this.itemIsSelected}
        renderItemExtra={this.renderItemExtra}
        getItemClassName={() => "hover-parent hover--display"}
      />
    );
  }
}
