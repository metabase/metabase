import React from "react";
import { t, jt } from "c-3po";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Icon from "metabase/components/Icon";

import Filter from "../Filter";
import FilterPopover from "../filters/FilterPopover";

import WorksheetSection from "./WorksheetSection";

import Clause from "./Clause";
import ClauseDropTarget from "./dnd/ClauseDropTarget";
import DropTargetEmptyState from "./DropTargetEmptyState";

import SECTIONS from "./style";

const FiltersSection = ({ query, setDatasetQuery, style, className }) => {
  const filters = query.filters();
  const color = SECTIONS.filter.color;
  return (
    <WorksheetSection {...SECTIONS.filter} style={style} className={className}>
      <ClauseDropTarget
        color={color}
        onDrop={dimension => {
          query
            .addFilter(["=", dimension.mbql(), null])
            .update(setDatasetQuery);
        }}
      >
        {filters.length > 0 ? (
          filters.map((filter, index) => (
            <PopoverWithTrigger
              triggerElement={
                <Clause
                  color={color}
                  onRemove={() =>
                    query.removeFilter(index).update(setDatasetQuery)
                  }
                >
                  <Filter filter={filter} metadata={query.metadata()} />
                </Clause>
              }
            >
              <FilterPopover
                query={query}
                filter={filter}
                onCommitFilter={filter =>
                  query.updateFilter(index, filter).update(setDatasetQuery)
                }
                showFieldPicker={false}
              />
            </PopoverWithTrigger>
          ))
        ) : (
          <DropTargetEmptyState
            message={jt`Drag a column here to ${(
              <strong>{t`filter`}</strong>
            )} with it`}
          />
        )}
        {query.canAddFilter() && (
          <PopoverWithTrigger
            triggerElement={
              <Icon
                name="add"
                size={24}
                className="p1"
                style={{ color: SECTIONS.filter.color }}
              />
            }
            triggerClasses="flex-align-right flex align-center"
          >
            <FilterPopover
              isNew
              query={query}
              onCommitFilter={filter =>
                query.addFilter(filter).update(setDatasetQuery)
              }
            />
          </PopoverWithTrigger>
        )}
      </ClauseDropTarget>
    </WorksheetSection>
  );
};

export default FiltersSection;
