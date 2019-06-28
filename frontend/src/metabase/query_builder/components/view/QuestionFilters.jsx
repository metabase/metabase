import React from "react";

import cx from "classnames";

import Tooltip from "metabase/components/Tooltip";
import Icon from "metabase/components/Icon";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import ViewFilterPopover from "metabase/query_builder/components/view/ViewFilterPopover";

import { alpha } from "metabase/lib/colors";

const QuestionFilters = ({ question, expanded, onExpand, onCollapse }) => {
  const query = question.query();
  const filters = query.topLevelFilters();
  return filters.length === 0 ? (
    <PopoverWithTrigger
      triggerElement={<FilterButton icon="filter">{`Filter`}</FilterButton>}
      triggerClasses="flex align-center"
      sizeToFit
    >
      <ViewFilterPopover
        query={query}
        onChangeFilter={newFilter =>
          newFilter.add().update(null, { run: true })
        }
      />
    </PopoverWithTrigger>
  ) : expanded ? (
    <div className="flex align-center mr1">
      <FilterButton icon="filter" invert onClick={onCollapse} />
      {filters.map((filter, index) => (
        <PopoverWithTrigger
          triggerElement={<FilterButton>{filter.displayName()}</FilterButton>}
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
      <PopoverWithTrigger
        triggerElement={<FilterButton icon="add" />}
        triggerClasses="flex align-center"
        sizeToFit
      >
        <ViewFilterPopover
          query={query}
          onChangeFilter={newFilter =>
            newFilter.add().update(null, { run: true })
          }
        />
      </PopoverWithTrigger>
    </div>
  ) : (
    <Tooltip tooltip={`Show filters`}>
      <FilterButton icon="filter" invert onClick={onExpand}>
        {filters.length}
      </FilterButton>
    </Tooltip>
  );
};

const FilterButton = ({
  className,
  style = {},
  invert,
  children,
  onClick,
  icon,
  ...props
}) => (
  <span
    className={cx("rounded flex-align center text-bold", className, {
      "cursor-pointer": onClick,
    })}
    style={{
      padding: "2px 6px",
      paddingLeft: icon ? 6 : 8,
      paddingRight: children ? 8 : 6,
      ...(invert
        ? { backgroundColor: "#7172AD", color: "white" }
        : { backgroundColor: alpha("#7172AD", 0.2), color: "#7172AD" }),
      ...style,
    }}
    onClick={onClick}
  >
    {icon && <Icon name={icon} size={12} className={cx({ mr1: !!children })} />}
    {children}
  </span>
);

QuestionFilters.shouldRender = ({ question, queryBuilderMode }) =>
  question &&
  question.query() instanceof StructuredQuery &&
  question.query().table() &&
  queryBuilderMode !== "notebook";

export const questionHasFilters = question =>
  question &&
  question.query() instanceof StructuredQuery &&
  question.query().topLevelFilters().length > 0;

export default QuestionFilters;
