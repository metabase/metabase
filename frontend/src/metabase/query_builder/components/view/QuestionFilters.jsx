import React from "react";

import cx from "classnames";
import { t } from "ttag";

import Tooltip from "metabase/components/Tooltip";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import ViewFilterPopover from "./ViewFilterPopover";
import ViewPill from "./ViewPill";
import ViewButton from "./ViewButton";

import colors from "metabase/lib/colors";

const FilterPill = props => <ViewPill color={colors["accent2"]} {...props} />;

const FilterButton = props => (
  <ViewButton medium icon="filter" color={colors["accent2"]} {...props} />
);

export default function QuestionFilters({
  question,
  expanded,
  onExpand,
  onCollapse,
}) {
  const query = question.query();
  const filters = query.topLevelFilters();
  return filters.length === 0 ? null : expanded ? (
    <div className="flex align-center">
      <FilterPill invert icon="filter" className="mr1" onClick={onCollapse} />
      {filters.map((filter, index) => (
        <PopoverWithTrigger
          triggerElement={
            <FilterPill
              onRemove={() => filter.remove().update(null, { run: true })}
            >
              {filter.displayName()}
            </FilterPill>
          }
          triggerClasses="flex align-center mr1"
          sizeToFit
        >
          <ViewFilterPopover
            query={query}
            filter={filter}
            onChangeFilter={newFilter =>
              newFilter.replace().update(null, { run: true })
            }
          />
        </PopoverWithTrigger>
      ))}
      {/* <PopoverWithTrigger
        triggerElement={<FilterPill icon="add" />}
        triggerClasses="flex align-center"
        sizeToFit
      >
        <ViewFilterPopover
          query={query}
          onChangeFilter={newFilter =>
            newFilter.add().update(null, { run: true })
          }
        />
      </PopoverWithTrigger> */}
    </div>
  ) : (
    <Tooltip tooltip={`Show filters`}>
      <FilterPill invert icon="filter" onClick={onExpand}>
        {filters.length}
      </FilterPill>
    </Tooltip>
  );
}

// export function QuestionFilterWidget({ query, ...props }) {
//   return (
//     <PopoverWithTrigger
//       triggerElement={<FilterButton {...props} >{t`Filter}</FilterButton>}
//       triggerClasses="flex align-center"
//       sizeToFit
//     >
//       <ViewFilterPopover
//         query={query}
//         onChangeFilter={newFilter =>
//           newFilter.add().update(null, { run: true })
//         }
//       />
//     </PopoverWithTrigger>
//   );
// }
export function QuestionFilterWidget({
  question,
  isShowingFilterSidebar,
  onAddFilter,
  onCloseFilter,
  ...props
}) {
  return (
    <FilterButton
      onClick={isShowingFilterSidebar ? onCloseFilter : onAddFilter}
      active={isShowingFilterSidebar}
      {...props}
    >
      {t`Filter`}
    </FilterButton>
  );
}

QuestionFilters.shouldRender = ({ question, queryBuilderMode }) =>
  queryBuilderMode === "view" &&
  question.isStructured() &&
  question.query().topLevelFilters().length > 0;

QuestionFilterWidget.shouldRender = ({ question, queryBuilderMode }) =>
  queryBuilderMode === "view" &&
  question.isStructured() &&
  question.query().table();
