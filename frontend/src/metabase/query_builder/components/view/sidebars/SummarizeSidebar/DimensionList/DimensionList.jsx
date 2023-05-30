import React, { useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";

import { Input } from "metabase/core/components/Input";
import { DimensionListItem } from "./DimensionListItem";
import {
  DimensionListTableName,
  DimensionListFilterContainer,
} from "./DimensionList.styled";
import {
  filterItems,
  excludePinnedItems,
  getItemName,
  getItemIcon,
} from "./utils";

const propTypes = {
  queryTableId: PropTypes.number,
  dimension: PropTypes.object,
  dimensions: PropTypes.array,
  sections: PropTypes.array,
  pinnedItems: PropTypes.array,
  onChangeDimension: PropTypes.func.isRequired,
  onAddDimension: PropTypes.func.isRequired,
  onRemoveDimension: PropTypes.func.isRequired,
};

const getDimension = dimension => {
  return dimension.defaultDimension() || dimension;
};

export const DimensionList = ({
  queryTableId,
  dimensions,
  sections,
  onChangeDimension,
  onAddDimension,
  onRemoveDimension,
}) => {
  const isDimensionSelected = dimension =>
    dimensions.some(d => {
      // sometimes `dimension` has a join-alias and `d` doesn't -- with/without is equivalent in this scenario
      return d
        .withoutJoinAlias()
        .isSameBaseDimension(dimension.withoutJoinAlias());
    });

  const [filter, setFilter] = useState("");
  const debouncedFilter = useDebouncedValue(filter, SEARCH_DEBOUNCE_DURATION);
  const hasFilter = debouncedFilter.trim().length > 0;

  const [pinnedItems, setPinnedItems] = useState(() => {
    return sections
      .flatMap(section => section.items)
      .filter(item => isDimensionSelected(item.dimension, dimensions));
  });

  const handleSubDimensionChange = dimension => {
    if (isDimensionSelected(dimension)) {
      onChangeDimension(dimension);
    } else {
      onAddDimension(dimension);
    }
  };

  const handleAdd = dimension => {
    onAddDimension(getDimension(dimension));
  };

  const handleRemove = dimension => {
    setPinnedItems(
      pinnedItems.filter(
        pinnedItem => !pinnedItem.dimension.isEqual(dimension),
      ),
    );

    onRemoveDimension(getDimension(dimension));
  };

  const handleChange = dimension => {
    setPinnedItems([]);
    onChangeDimension(getDimension(dimension));
  };

  const handleFilterChange = e => setFilter(e.target.value);

  return (
    <>
      <DimensionListFilterContainer>
        <Input
          fullWidth
          placeholder={t`Find...`}
          value={filter}
          leftIcon="search"
          onResetClick={() => setFilter("")}
          onChange={handleFilterChange}
        />
      </DimensionListFilterContainer>
      {!hasFilter && (
        <ul data-testid="pinned-dimensions">
          {pinnedItems.map(item => {
            const isForeignDimension =
              item.dimension != null &&
              item.dimension.tableId?.() !== queryTableId;
            const name = getItemName(item, isForeignDimension);

            return (
              <DimensionListItem
                key={name}
                dimension={item.dimension}
                name={name}
                iconName={getItemIcon(item)}
                dimensions={dimensions}
                onRemoveDimension={handleRemove}
                onSubDimensionChange={handleSubDimensionChange}
                isSelected={isDimensionSelected(item.dimension)}
              />
            );
          })}
        </ul>
      )}
      <ul data-testid="unpinned-dimensions">
        {sections.map(section => {
          const items = hasFilter
            ? filterItems(section.items, debouncedFilter)
            : excludePinnedItems(section.items, pinnedItems);

          return (
            <li key={section.name}>
              <DimensionListTableName>{section.name}</DimensionListTableName>
              <ul>
                {items.map(item => {
                  return (
                    <DimensionListItem
                      key={getItemName(item)}
                      dimension={item.dimension}
                      name={getItemName(item)}
                      iconName={getItemIcon(item)}
                      dimensions={dimensions}
                      onChangeDimension={handleChange}
                      onAddDimension={handleAdd}
                      onRemoveDimension={handleRemove}
                      onSubDimensionChange={handleSubDimensionChange}
                      isSelected={isDimensionSelected(item.dimension)}
                    />
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </>
  );
};

DimensionList.propTypes = propTypes;
