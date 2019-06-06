import React from "react";
import { t } from "ttag";

import SidebarContent from "metabase/query_builder/components/view/SidebarContent";
import ViewFilters from "../ViewFilterPopover";

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
        onChangeFilter={newFilter => {
          if (filter) {
            newFilter.replace().update(null, { run: true });
          } else {
            newFilter.add().update(null, { run: true });
          }
          onClose();
        }}
        onClose={onClose}
      />
    </SidebarContent>
  );
};

export default FilterSidebar;
