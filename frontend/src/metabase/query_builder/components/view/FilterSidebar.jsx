import React from "react";

import FilterPopover from "../filters/FilterPopover";

const FilterSidebar = ({ question, index, onClose }) => {
  const query = question.query();
  return (
    <div>
      <FilterPopover
        query={question.query()}
        filter={index != null ? query.filters()[index] : null}
        onCommitFilter={filter => {
          if (index != null) {
            query.updateFilter(index, filter).update();
          } else {
            query.addFilter(filter).update();
          }
          onClose();
        }}
        onClose={onClose}
      />
    </div>
  );
};

export default FilterSidebar;
