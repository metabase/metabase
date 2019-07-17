import React from "react";
import { t } from "ttag";
import cx from "classnames";

import SidebarContent from "metabase/query_builder/components/view/SidebarContent";
import ViewFilterPopover from "../ViewFilterPopover";

import { color } from "metabase/lib/colors";

/** FilterSidebar operates on filters from topLevelFilters */
const FilterSidebar = ({ className, question, index, onClose }) => {
  const query = question.query();
  const filter = index != null ? query.topLevelFilters()[index] : null;
  return (
    <SidebarContent
      title={t`Pick a column to filter`}
      color={color("accent7")}
      onClose={onClose}
      className={cx(className, "spread")}
    >
      <ViewFilterPopover
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
        maxHeight={Infinity}
        width={410}
      />
    </SidebarContent>
  );
};

export default FilterSidebar;
