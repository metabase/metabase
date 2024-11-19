import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";

import { Filter } from "metabase/admin/datamodel/components/Filter";
import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import { Popover } from "metabase/ui";
import type StructuredQuery from "metabase-lib/v1/queries/StructuredQuery";
import type FilterType from "metabase-lib/v1/queries/structured/Filter";

import { FilterPopover } from "../FilterPopover";

import {
  FilterField,
  FilterOperator,
  FilterWidgetRoot,
  QueryOption,
} from "./FilterWidget.styled";

type PillProps = {
  field: string;
  operator: string;
  values: string[];
};

export const filterWidgetFilterRenderer = ({
  field,
  operator,
  values,
}: PillProps) => (
  <div className={cx(CS.flex, CS.flexColumn, CS.justifyCenter)}>
    <div
      className={cx(CS.flex, CS.alignCenter)}
      style={{
        padding: "0.5em",
        paddingTop: "0.3em",
        paddingBottom: "0.3em",
        paddingLeft: 0,
      }}
    >
      {field && <FilterField>{field}</FilterField>}
      {field && operator ? <span>&nbsp;</span> : null}
      {operator && (
        <FilterOperator>
          <QueryOption
            as="a"
            className={cx("QueryOption", CS.flex, CS.alignCenter)}
          >
            {operator}
          </QueryOption>
        </FilterOperator>
      )}
    </div>
    {values.length > 0 && (
      <div className={cx(CS.flex, CS.alignCenter, CS.flexWrap)}>
        {values.map((value, valueIndex) => (
          <div key={valueIndex} className={QueryBuilderS.FilterSection}>
            <QueryOption className="QueryOption">{value}</QueryOption>
          </div>
        ))}
      </div>
    )}
  </div>
);

type Props = {
  filter: FilterType;
  query: StructuredQuery;
  updateFilter: (index: number, filter: any[]) => void;
  index: number;
  removeFilter: (index: number) => void;
  maxDisplayValues?: number;
};

/**
 * @deprecated use MLv2
 */
export const FilterWidget = ({
  filter,
  index,
  query,
  removeFilter,
  updateFilter,
  maxDisplayValues = 1,
}: Props) => {
  const [opened, { close, open }] = useDisclosure(filter[0] == null);

  return (
    <Popover opened={opened} onClose={close}>
      <Popover.Target>
        <FilterWidgetRoot
          data-testid="filter-widget-target"
          isSelected={opened}
        >
          <div className={cx(CS.flex, CS.justifyCenter)} onClick={open}>
            <Filter
              metadata={query?.metadata?.()}
              filter={filter}
              index={index}
              removeFilter={removeFilter}
              maxDisplayValues={maxDisplayValues}
            >
              {filterWidgetFilterRenderer}
            </Filter>
          </div>
        </FilterWidgetRoot>
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPopover
          query={query}
          filter={filter}
          onChangeFilter={filter => {
            updateFilter?.(index, filter);
            close();
          }}
          onClose={close}
          isNew={false}
        />
      </Popover.Dropdown>
    </Popover>
  );
};
