import React from "react";
import { t } from "c-3po";

import SidebarContent from "metabase/query_builder/components/view/SidebarContent";
import ViewFilters from "../ViewFilters";

/** FilterSidebar operates on filters from topLevelFilters */
const FilterSidebar = ({ question, index, onClose }) => {
  const query = question.query();
  const filter = index != null ? query.topLevelFilters()[index] : null;
  return (
    <SidebarContent icon="filter" title={t`Filter`} onClose={onClose}>
      <ViewFilters
        key={index}
        query={question.query()}
        filter={filter}
        onChangeFilter={(newFilter, query) => {
          if (filter) {
            filter.replace(newFilter).update(null, { run: true });
          } else {
            query.addFilter(newFilter).update(null, { run: true });
          }
          onClose();
        }}
        onClose={onClose}
      />
    </SidebarContent>
  );
};

export default FilterSidebar;
