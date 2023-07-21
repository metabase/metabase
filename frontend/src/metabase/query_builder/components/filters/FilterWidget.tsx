import { Component } from "react";

import * as React from "react";

import Popover from "metabase/components/Popover";
import FilterComponent from "metabase/query_builder/components/Filter";

import Filter from "metabase-lib/queries/structured/Filter";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import FilterPopover from "./FilterPopover";
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
  <div className="flex flex-column justify-center">
    <div
      className="flex align-center"
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
          <QueryOption as="a" className="QueryOption flex align-center">
            {operator}
          </QueryOption>
        </FilterOperator>
      )}
    </div>
    {values.length > 0 && (
      <div className="flex align-center flex-wrap">
        {values.map((value, valueIndex) => (
          <div key={valueIndex} className="Filter-section Filter-section-value">
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default class FilterWidget extends Component<Props, State> {
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
        <div className="flex justify-center" onClick={this.open}>
          {this.renderFilter()}
        </div>
        {this.renderPopover()}
      </FilterWidgetRoot>
    );
  }
}
