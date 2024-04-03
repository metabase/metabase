import cx from "classnames";
import { Component } from "react";
import * as React from "react";

import { Filter as FilterComponent } from "metabase/admin/datamodel/components/Filter";
import Popover from "metabase/components/Popover";
import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import type StructuredQuery from "metabase-lib/v1/queries/StructuredQuery";
import type Filter from "metabase-lib/v1/queries/structured/Filter";

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
  filter: Filter;
  query: StructuredQuery;
  updateFilter: (index: number, filter: any[]) => void;
  index: number;
  removeFilter: (index: number) => void;
};

type State = {
  isOpen: boolean;
};

/**
 * @deprecated use MLv2
 */
export class FilterWidget extends Component<Props, State> {
  rootRef: React.RefObject<HTMLDivElement>;

  constructor(props: Props) {
    super(props);

    this.state = {
      isOpen: this.props.filter[0] == null,
    };

    this.rootRef = React.createRef();
  }

  static defaultProps = {
    maxDisplayValues: 1,
  };

  open = () => {
    this.setState({ isOpen: true });
  };

  close = () => {
    this.setState({ isOpen: false });
  };

  renderFilter() {
    const { query } = this.props;
    return (
      <FilterComponent
        metadata={query && query.metadata && query.metadata()}
        {...this.props}
      >
        {filterWidgetFilterRenderer}
      </FilterComponent>
    );
  }

  renderPopover() {
    if (this.state.isOpen) {
      const { query, filter } = this.props;
      return (
        <Popover
          id="FilterPopover"
          className="FilterPopover"
          target={this.rootRef.current}
          isInitiallyOpen={this.props.filter[1] === null}
          onClose={this.close}
          horizontalAttachments={["left", "center"]}
          autoWidth
        >
          <FilterPopover
            query={query}
            filter={filter}
            onChangeFilter={filter => {
              this.props.updateFilter?.(this.props.index, filter);
              this.close();
            }}
            onClose={this.close}
            isNew={false}
          />
        </Popover>
      );
    }
  }

  render() {
    return (
      <FilterWidgetRoot isSelected={this.state.isOpen} ref={this.rootRef}>
        <div className={cx(CS.flex, CS.justifyCenter)} onClick={this.open}>
          {this.renderFilter()}
        </div>
        {this.renderPopover()}
      </FilterWidgetRoot>
    );
  }
}
