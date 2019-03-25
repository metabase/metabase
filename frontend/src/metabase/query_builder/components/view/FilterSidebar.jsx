import React from "react";

import Icon from "metabase/components/Icon";
import FilterPopover from "../filters/FilterPopover";

const FilterSidebar = ({ question, index, onClose }) => {
  const query = question.query();
  return (
    <div>
      <Icon name="close" onClick={() => onClose()} />
      <FilterPopover
        query={question.query()}
        filter={index != null ? query.filters()[index] : null}
        onChangeFilter={filter => {
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
