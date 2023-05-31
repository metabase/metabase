/* eslint-disable react/prop-types */
import React, { Component } from "react";
import _ from "underscore";
import { t } from "ttag";

import AccordionList from "metabase/core/components/AccordionList";
import Icon from "metabase/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Tooltip from "metabase/core/components/Tooltip";
import { FieldDimension } from "metabase-lib/Dimension";

import { DimensionPicker } from "./DimensionPicker";
import { FieldListGroupingTrigger } from "./DimensionList.styled";

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
    this.updateSections(this.props.sections);
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (this.props.sections !== nextProps.sections) {
      this.updateSections(nextProps.sections);
    }
  }

  updateSections(sections = []) {
    this.setState({
      sections: sections.map(section => ({
        ...section,
        items: section.items.map(item => ({
          ...item,
          name: item.name || item.dimension?.displayName(),
          icon: item.icon || item.dimension?.icon(),
        })),
      })),
    });
  }

  getDimensions() {
    return (
      this.props.dimensions ||
      (this.props.dimension ? [this.props.dimension] : [])
    );
  }

  itemIsSelected = item => {
    const dimensions = this.getDimensions();
    return (
      item.dimension &&
      _.any(dimensions, dimension => {
        // sometimes `item.dimension` has a join-alias and `dimension` doesn't
        // with/without is equivalent in this scenario
        return dimension.isSameBaseDimension(item.dimension.withoutJoinAlias());
      })
    );
  };

  renderItemExtra = (item, itemIndex, isSelected) => {
    const {
      enableSubDimensions,
      preventNumberSubDimensions,
      onAddDimension,
      onRemoveDimension,
    } = this.props;

    const surpressSubDimensions =
      preventNumberSubDimensions && item.dimension.field().isSummable();

    const subDimensions =
      enableSubDimensions &&
      // Do not display sub dimension if this is an FK (metabase#16787)
      !item.dimension?.field().isFK() &&
      // Or if this is a custom expression (metabase#11371)
      !item.dimension?.isExpression() &&
      !surpressSubDimensions &&
      item.dimension.dimensions();

    const multiSelect = !!(onAddDimension || onRemoveDimension);

    const sectionDimension = this.props.dimension
      ? this.props.dimension
      : _.find(
          this.getDimensions(),
          dimension => dimension.field() === item.dimension.field(),
        );

    return (
      <div className="Field-extra flex align-center">
        {item.dimension?.tag && (
          <span className="h5 text-light px1">{item.dimension.tag}</span>
        )}
        {subDimensions?.length > 0 ? (
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
    const dimensions = this.getDimensions();
    const subDimension =
      _.find(dimensions, dimension =>
        dimension.isSameBaseDimension(otherDimension),
      ) || otherDimension.defaultDimension();
    const name = subDimension?.subTriggerDisplayName() ?? null;

    return (
      <FieldListGroupingTrigger
        className="FieldList-grouping-trigger text-white-hover flex align-center p1 cursor-pointer"
        data-testid="dimension-list-item-binning"
      >
        {name && <h4>{name}</h4>}
        {!multiSelect && <Icon name="chevronright" className="ml1" size={16} />}
      </FieldListGroupingTrigger>
    );
  }

  getDimensionFromItem(item) {
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
      (preventNumberSubDimensions && dimension.field().isSummable()) ||
      dimension?.field().isFK()
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
      onChangeDimension(this.getDimensionFromItem(item), item);
    } else if (onChangeOther) {
      onChangeOther(item);
    }
  };

  handleAdd = item => {
    const dimension = this.getDimensionFromItem(item);
    if (dimension && this.props.onAddDimension) {
      this.props.onAddDimension(dimension, item);
    }
  };

  handleRemove = item => {
    const dimension = this.getDimensionFromItem(item);
    if (dimension && this.props.onRemoveDimension) {
      this.props.onRemoveDimension(dimension, item);
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
