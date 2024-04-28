/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";
import _ from "underscore";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import AccordionList from "metabase/core/components/AccordionList";
import ListS from "metabase/css/components/list.module.css";
import CS from "metabase/css/core/index.css";
import { Icon, Box } from "metabase/ui";
import { FieldDimension } from "metabase-lib/v1/Dimension";

import { DimensionPicker } from "../DimensionPicker";

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

/**
 * @deprecated use MLv2
 */
export class DimensionList extends Component {
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

  renderItemExtra = (item, isSelected) => {
    const { enableSubDimensions, preventNumberSubDimensions } = this.props;

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

    const sectionDimension = this.props.dimension
      ? this.props.dimension
      : _.find(
          this.getDimensions(),
          dimension => dimension.field() === item.dimension.field(),
        );

    return (
      <Box className="Field-extra">
        {item.dimension?.tag && (
          <span className={cx(CS.h5, CS.textLight, CS.px1)}>
            {item.dimension.tag}
          </span>
        )}
        {subDimensions?.length > 0 ? (
          <PopoverWithTrigger
            className={this.props.className}
            hasArrow={false}
            triggerElement={this.renderSubDimensionTrigger(item.dimension)}
            tetherOptions={SUBMENU_TETHER_OPTIONS}
            sizeToFit
          >
            {({ onClose }) => (
              <DimensionPicker
                className={CS.scrollY}
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
      </Box>
    );
  };

  renderSubDimensionTrigger(otherDimension) {
    const dimensions = this.getDimensions();
    const subDimension =
      _.find(dimensions, dimension =>
        dimension.isSameBaseDimension(otherDimension),
      ) || otherDimension.defaultDimension();
    const name = subDimension?.subTriggerDisplayName() ?? null;

    return (
      <FieldListGroupingTrigger
        className={cx(
          ListS.FieldListGroupingTrigger,
          CS.textWhiteHover,
          CS.flex,
          CS.alignCenter,
          CS.p1,
          CS.cursorPointer,
        )}
        data-testid="dimension-list-item-binning"
      >
        {name && <h4>{name}</h4>}
        <Icon name="chevronright" className={CS.ml1} size={16} />
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

  render() {
    return (
      <AccordionList
        {...this.props}
        itemTestId="dimension-list-item"
        sections={this.state.sections}
        onChange={this.handleChange}
        itemIsSelected={this.itemIsSelected}
        renderItemExtra={this.renderItemExtra}
        getItemClassName={() => cx(CS.hoverParent, CS.hoverDisplay)}
      />
    );
  }
}
