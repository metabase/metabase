import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Tooltip from "metabase/components/Tooltip";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import { DimensionPicker } from "metabase/query_builder/components/DimensionPicker";
import Icon from "metabase/components/Icon";

import { getSelectedSubDimensionName } from "../utils";

import {
  DimensionListItemRoot,
  DimensionListItemTitle,
  DimensionListItemIcon,
  DimensionListItemContent,
  DimensionListItemTitleContainer,
  DimensionListItemAddButton,
  DimensionListItemRemoveButton,
  DimensionListItemTag,
  SubDimensionButton,
} from "./DimensionListItem.styled";

const noop = () => {};

const propTypes = {
  dimension: PropTypes.object,
  name: PropTypes.string.isRequired,
  iconName: PropTypes.string,
  tag: PropTypes.string,
  isSelected: PropTypes.bool,
  shouldIncludeTable: PropTypes.bool,
  onAddDimension: PropTypes.func,
  onRemoveDimension: PropTypes.func,
  onChangeDimension: PropTypes.func,
  onSubDimensionChange: PropTypes.func,
  dimensions: PropTypes.array,
};

export const DimensionListItem = ({
  dimension,
  name,
  iconName,
  tag,
  isSelected,
  dimensions,
  onAddDimension = noop,
  onChangeDimension = noop,
  onRemoveDimension = noop,
  onSubDimensionChange,
}) => {
  const selectedSubDimension = dimensions.find(
    d => d.field() === dimension.field(),
  );

  const subDimensions = dimension.field().isFK()
    ? null
    : dimension.dimensions();

  const hasSubDimensions = subDimensions && subDimensions.length > 0;

  const selectedSubDimensionName = getSelectedSubDimensionName(
    dimension,
    dimensions,
  );

  const handleAdd = () => onAddDimension(dimension);
  const handleRemove = () => onRemoveDimension(dimension);
  const handleChange = () => onChangeDimension(dimension);

  return (
    <DimensionListItemRoot
      data-testid="dimension-list-item"
      isSelected={isSelected}
      aria-selected={isSelected}
    >
      <DimensionListItemContent>
        <DimensionListItemTitleContainer onClick={handleChange}>
          <DimensionListItemIcon name={iconName} size={18} />
          <DimensionListItemTitle data-testid="dimension-list-item-name">
            {name}
          </DimensionListItemTitle>
        </DimensionListItemTitleContainer>

        {tag && <DimensionListItemTag>{tag}</DimensionListItemTag>}

        {hasSubDimensions && selectedSubDimensionName && (
          <PopoverWithTrigger
            triggerClasses="align-self-stretch"
            triggerElement={
              <SubDimensionButton data-testid="dimension-list-item-binning">
                {selectedSubDimensionName}
              </SubDimensionButton>
            }
            sizeToFit
          >
            {({ onClose }) => (
              <DimensionPicker
                className="scroll-y text-green"
                dimension={selectedSubDimension}
                dimensions={subDimensions}
                onChangeDimension={dimension => {
                  onSubDimensionChange(dimension);
                  onClose();
                }}
              />
            )}
          </PopoverWithTrigger>
        )}

        {isSelected && (
          <DimensionListItemRemoveButton aria-label="Remove dimension">
            <Icon name="close" onClick={handleRemove} />
          </DimensionListItemRemoveButton>
        )}
      </DimensionListItemContent>

      {!isSelected && (
        <Tooltip tooltip={t`Add grouping`}>
          <DimensionListItemAddButton
            onClick={handleAdd}
            aria-label="Add dimension"
          >
            <Icon name="add" size={12} />
          </DimensionListItemAddButton>
        </Tooltip>
      )}
    </DimensionListItemRoot>
  );
};

DimensionListItem.propTypes = propTypes;
