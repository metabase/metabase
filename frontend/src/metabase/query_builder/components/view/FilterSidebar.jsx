import React from "react";
import { t } from "c-3po";

import Icon from "metabase/components/Icon";
import ViewFilters from "./ViewFilters";

const FilterSidebar = ({ question, index, onClose }) => {
  const query = question.query();
  return (
    <div>
      <div className="flex mb1 pl4 pr2 pt3">
        <div className="flex align-center pb1">
          <Icon name="filter" />
          <h3 className="ml1 text-heavy">{t`Filter`}</h3>
        </div>
        <Icon
          name="close"
          className="flex-align-right text-medium text-brand-hover cursor-pointer"
          onClick={() => onClose()}
          size={20}
        />
      </div>
      <ViewFilters
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
