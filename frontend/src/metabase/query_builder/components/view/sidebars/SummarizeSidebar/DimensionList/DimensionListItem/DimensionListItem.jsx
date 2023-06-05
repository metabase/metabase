import PropTypes from "prop-types";
import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import { Icon } from "metabase/core/components/Icon";

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
  SubDimensionPicker,
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
      aria-label={name}
      aria-selected={isSelected}
    >
      <DimensionListItemContent>
        <DimensionListItemTitleContainer onClick={handleChange}>
          <DimensionListItemIcon name={iconName} />
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
              <SubDimensionPicker
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
            <Icon name="add" />
          </DimensionListItemAddButton>
        </Tooltip>
      )}
    </DimensionListItemRoot>
  );
};

DimensionListItem.propTypes = propTypes;
