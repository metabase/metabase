/* @flow */

import React, { Component } from "react";
import { t } from "c-3po";

import FieldList from "../FieldList.jsx";
import OperatorSelector from "../filters/OperatorSelector.jsx";
import FilterOptions from "../filters/FilterOptions";
import DatePicker, { getOperator } from "../filters/pickers/DatePicker.jsx";
import TimePicker from "../filters/pickers/TimePicker.jsx";
import NumberPicker from "../filters/pickers/NumberPicker.jsx";
import SelectPicker from "../filters/pickers/SelectPicker.jsx";
import TextPicker from "../filters/pickers/TextPicker.jsx";
import FieldValuesWidget from "metabase/components/FieldValuesWidget.jsx";

import Icon from "metabase/components/Icon.jsx";

import Query from "metabase/lib/query";
import {
  isDate,
  isTime,
  getFilterArgumentFormatOptions,
} from "metabase/lib/schema_metadata";
import { formatField, singularize } from "metabase/lib/formatting";

import cx from "classnames";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import type { FieldFilter, ConcreteField } from "metabase/meta/types/Query";
import type { FilterOperator } from "metabase/meta/types/Metadata";

import Field from "metabase-lib/lib/metadata/Field";

import Filter from "metabase-lib/lib/queries/structured/Filter";

type Props = {
  maxHeight?: number,
  query: StructuredQuery,
  filter?: Filter,
  onChangeFilter: (filter: Filter) => void,
  onClose: () => void,
  showFieldPicker?: boolean,
};

type State = {
  filter: Filter,
};

export default class ViewFilters extends Component {
  props: Props;
  state: State;

  static defaultProps = {
    showFieldPicker: true,
  };

  constructor(props: Props) {
    super(props);

    this.state = {
      // $FlowFixMe
      filter: new Filter(props.filter || [], null, props.query),
    };
  }

  componentWillMount() {
    window.addEventListener("keydown", this.commitOnEnter);
  }

  componentWillUnmount() {
    window.removeEventListener("keydown", this.commitOnEnter);
  }

  commitOnEnter = (event: KeyboardEvent) => {
    if (this.isValid() && event.key === "Enter") {
      this.commitFilter(this.state.filter);
    }
  };

  commitFilter = (filter: FieldFilter) => {
    this.props.onChangeFilter(filter);
    this.props.onClose();
  };

  setField = (fieldRef: ConcreteField) => {
    const { filter } = this.state;
    let newFilter = filter.setDimension(fieldRef);
    if (filter !== newFilter) {
      const defaultOperator = newFilter.dimension().defaultOperator();
      if (!newFilter.operatorName() && defaultOperator) {
        newFilter = newFilter.setOperator(defaultOperator);
      }
      this.setState({ filter: newFilter });
    }
  };

  setFilter = (newFilter: FieldFilter) => {
    const { filter } = this.state;
    this.setState({ filter: filter.set(newFilter) });
  };

  setOperator = (operatorName: string) => {
    const { filter } = this.state;
    if (filter.operator() !== operatorName) {
      const newFilter = filter.setOperator(operatorName);
      this.setState({ filter: newFilter });
    }
  };

  setValue = (index: number, value: any) => {
    const { filter } = this.state;
    const newFilter = filter.setArgument(index, value);
    this.setState({ filter: newFilter });
  };

  setValues = (values: any[]) => {
    const { filter } = this.state;
    const newFilter = filter.setArguments(values);
    this.setState({ filter: newFilter });
  };

  isValid() {
    const { filter } = this.state;
    return filter.isValid();
  }

  clearField = () => {
    const { filter } = this.state;
    const newFilter = filter.setDimension(null);
    this.setState({ filter: newFilter });
  };

  onCommit = () => {
    if (this.isValid()) {
      this.commitFilter(this.state.filter);
    }
  };

  render() {
    const { query, showFieldPicker } = this.props;
    const { filter } = this.state;
    const dimension = filter.dimension();

    if (filter.isSegmentFilter() || !dimension) {
      return (
        <div className="full p1">
          <FieldList
            field={dimension && dimension.mbql()}
            fieldOptions={query.filterFieldOptions(filter)}
            segmentOptions={query.filterSegmentOptions(filter)}
            table={query.table()}
            onFieldChange={this.setField}
            onFilterChange={this.commitFilter}
          />
        </div>
      );
    } else {
      const field = dimension.field();
      const tableDisplayName = field.table && field.table.displayName();

      const showOperatorSelector = !(field.isTime() || field.isDate());
      const showHeader = showFieldPicker || showOperatorSelector;

      return (
        <div className="full p1">
          {showHeader && (
            <div>
              {showFieldPicker && (
                <div className="flex py1">
                  <span
                    className="cursor-pointer text-purple-hover transition-color flex align-center"
                    onClick={this.clearField}
                  >
                    <Icon name="chevronleft" size={16} />
                    {tableDisplayName && (
                      <h3 className="ml1">{singularize(tableDisplayName)}</h3>
                    )}
                  </span>
                  {tableDisplayName && <h3 className="ml1">-</h3>}
                  <h3 className="ml1 text-default">{formatField(field)}</h3>
                </div>
              )}
              {showOperatorSelector && (
                <OperatorSelector
                  className={
                    showFieldPicker ? "flex-align-right pl2" : "flex-full p1"
                  }
                  operator={filter.operatorName()}
                  operators={filter.operatorOptions()}
                  onOperatorChange={this.setOperator}
                />
              )}
            </div>
          )}
          {isTime(field) ? (
            <TimePicker
              className="mt1 border-top"
              filter={filter}
              onFilterChange={this.setFilter}
            />
          ) : isDate(field) ? (
            <DatePicker
              className="mt1 border-top"
              filter={filter}
              onFilterChange={this.setFilter}
            />
          ) : (
            <DefaultPicker
              filter={filter}
              setValue={this.setValue}
              setValues={this.setValues}
              onCommit={this.onCommit}
            />
          )}
          <div>
            <FilterOptions
              filter={filter}
              onFilterChange={this.setFilter}
              operator={
                field.isDate()
                  ? // DatePicker uses a different set of operator objects
                    getOperator(filter)
                  : // Normal operators defined in schema_metadata
                    filter.operator()
              }
            />
            <button
              data-ui-tag="add-filter"
              className={cx("Button Button--purple ml-auto", {
                disabled: !this.isValid(),
              })}
              onClick={() => this.commitFilter(this.state.filter)}
            >
              {!this.props.filter ? t`Add filter` : t`Update filter`}
            </button>
          </div>
        </div>
      );
    }
  }
}

const DefaultPicker = ({ filter, setValue, setValues, onCommit }) => {
  const operator = filter.operator();
  const field = filter.dimension().field();
  let fieldWidgets =
    operator &&
    operator.fields.map((operatorField, index) => {
      if (!operator) {
        return null;
      }
      let values, onValuesChange;
      let placeholder =
        (operator && operator.placeholders && operator.placeholders[index]) ||
        undefined;
      if (operator.multi) {
        values = filter.arguments();
        onValuesChange = values => setValues(values);
      } else {
        // $FlowFixMe
        values = [filter.arguments()[index]];
        onValuesChange = values => setValue(index, values[0]);
      }
      if (operatorField.type === "hidden") {
        return null;
      } else if (operatorField.type === "select") {
        return (
          <SelectPicker
            key={index}
            options={operatorField.values}
            // $FlowFixMe
            values={(values: Array<string>)}
            onValuesChange={onValuesChange}
            placeholder={placeholder}
            multi={operator.multi}
            onCommit={onCommit}
          />
        );
      } else if (field && field.id != null) {
        return (
          <FieldValuesWidget
            value={(values: Array<string>)}
            onChange={onValuesChange}
            multi={operator.multi}
            placeholder={placeholder}
            field={field}
            searchField={field.filterSearchField()}
            autoFocus={index === 0}
            alwaysShowOptions={operator.fields.length === 1}
            formatOptions={getFilterArgumentFormatOptions(operator, index)}
            minWidth={440}
            maxWidth={440}
          />
        );
      } else if (operatorField.type === "text") {
        return (
          <TextPicker
            key={index}
            // $FlowFixMe
            values={(values: Array<string>)}
            onValuesChange={onValuesChange}
            placeholder={placeholder}
            multi={operator.multi}
            onCommit={onCommit}
          />
        );
      } else if (operatorField.type === "number") {
        return (
          <NumberPicker
            key={index}
            // $FlowFixMe
            values={(values: Array<number | null>)}
            onValuesChange={onValuesChange}
            placeholder={placeholder}
            multi={operator.multi}
            onCommit={onCommit}
          />
        );
      }
      return (
        <span key={index}>
          {t`not implemented ${operatorField.type}`}{" "}
          {operator.multi ? t`true` : t`false`}
        </span>
      );
    });
  if (fieldWidgets && fieldWidgets.filter(f => f).length > 0) {
    return <div>{fieldWidgets}</div>;
  } else {
    return <div className="mb1" />;
  }
};
