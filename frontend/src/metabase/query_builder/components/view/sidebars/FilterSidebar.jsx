import React from "react";
import { t } from "c-3po";

import SidebarContent from "metabase/query_builder/components/view/SidebarContent";
import ViewFilters from "../ViewFilters";

const FilterSidebar = ({ question, index, onClose }) => {
  const query = question.query();
  return (
    <SidebarContent icon="filter" title={t`Filter`} onClose={onClose}>
      <ViewFilters
        key={index}
        query={question.query()}
        filter={index != null ? query.filters()[index] : null}
        onChangeFilter={filter => {
          if (index != null) {
            query.updateFilter(index, filter).update(null, { run: true });
          } else {
            query.addFilter(filter).update(null, { run: true });
          }
          onClose();
        }}
        onClose={onClose}
      />
    </SidebarContent>
  );
};

export default FilterSidebar;
