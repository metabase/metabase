/* @flow */

import React, { Component } from "react";
import { connect } from "react-redux";
import { t, jt } from "ttag";

import TokenField from "metabase/components/TokenField";
import ValueComponent from "metabase/components/Value";
import LoadingSpinner from "metabase/components/LoadingSpinner";

import AutoExpanding from "metabase/hoc/AutoExpanding";

import { MetabaseApi } from "metabase/services";
import { addRemappings, fetchFieldValues } from "metabase/redux/metadata";
import { defer } from "metabase/lib/promise";
import { debounce, zip } from "underscore";
import { stripId } from "metabase/lib/formatting";

import Fields from "metabase/entities/fields";

import type Field from "metabase-lib/lib/metadata/Field";
import type { FieldId } from "metabase-types/types/Field";
import type { Value } from "metabase-types/types/Dataset";
import type { FormattingOptions } from "metabase/lib/formatting";
import type { LayoutRendererProps } from "metabase/components/TokenField";

const MAX_SEARCH_RESULTS = 100;

const mapDispatchToProps = {
  addRemappings,
  fetchFieldValues,
};

function mapStateToProps(state, { fields = [] }) {
  // try and use the selected fields, but fall back to the ones passed
  return {
    fields: fields.map(
      field =>
        Fields.selectors.getObject(state, { entityId: field.id }) || field,
    ),
  };
}

type Props = {
  value: Value[],
  onChange: (value: Value[]) => void,
  fields: Field[],
  disablePKRemappingForSearch?: boolean,
  multi?: boolean,
  autoFocus?: boolean,
  color?: string,
  fetchFieldValues: (id: FieldId) => void,
  maxResults: number,
  style?: { [key: string]: string | number },
  placeholder?: string,
  formatOptions?: FormattingOptions,
  maxWidth?: number,
  minWidth?: number,
  optionsMaxHeight?: Number,
  alwaysShowOptions?: boolean,

  className?: string,
};

type State = {
  loadingState: "INIT" | "LOADING" | "LOADED",
  options: [Value, ?string][],
  lastValue: string,
};

@AutoExpanding
export class FieldValuesWidget extends Component {
  props: Props;
  state: State;

  _cancel: ?() => void;

  constructor(props: Props) {
    super(props);
    this.state = {
      options: [],
      loadingState: "INIT",
      lastValue: "",
    };
  }

  static defaultProps = {
    color: "purple",
    maxResults: MAX_SEARCH_RESULTS,
    alwaysShowOptions: true,
    style: {},
    formatOptions: {},
    maxWidth: 500,
  };

  componentWillMount() {
    const { fields, fetchFieldValues } = this.props;
    if (fields.every(field => field.has_field_values === "list")) {
      fields.forEach(field => fetchFieldValues(field.id));
    }
  }

  componentWillUnmount() {
    if (this._cancel) {
      this._cancel();
    }
  }

  hasList() {
    return this.props.fields.every(
      field => field.has_field_values === "list" && field.values,
    );
  }

  isSearchable() {
    const { fields } = this.props;
    return (
      // search is available if:
      // all fields have a valid search field
      fields.every(this.searchField) &&
      // at least one field is set to display as "search"
      fields.some(f => f.has_field_values === "search") &&
      // and all fields are either "search" or "list"
      fields.every(
        f => f.has_field_values === "search" || f.has_field_values === "list",
      )
    );
  }

  onInputChange = (value: string) => {
    if (value && this.isSearchable()) {
      this._search(value);
    }

    return value;
  };

  searchField = (field: Field) => {
    if (this.props.disablePKRemappingForSearch && field.isPK()) {
      return field.isSearchable() ? field : null;
    }

    const remappedField = field.remappedField();
    if (remappedField && remappedField.isSearchable()) {
      return remappedField;
    }
    return field.isSearchable() ? field : null;
  };

  search = async (value: string, cancelled: Promise<void>) => {
    if (!value) {
      return;
    }

    const { fields } = this.props;

    const allResults = await Promise.all(
      fields.map(field =>
        MetabaseApi.field_search(
          {
            value,
            fieldId: field.id,
            // $FlowFixMe all fields have a search field if we're searching
            searchFieldId: this.searchField(field).id,
            limit: this.props.maxResults,
          },
          { cancelled },
        ),
      ),
    );

    for (const [field, result] of zip(fields, allResults)) {
      if (result && field.remappedField() === this.searchField(field)) {
        // $FlowFixMe: addRemappings provided by @connect
        this.props.addRemappings(field.id, result);
      }
    }

    return dedupeValues(allResults);
  };

  _search = (value: string) => {
    const { lastValue, options } = this.state;

    // if this search is just an extension of the previous search, and the previous search
    // wasn't truncated, then we don't need to do another search because TypeaheadListing
    // will filter the previous result client-side
    if (
      lastValue &&
      value.slice(0, lastValue.length) === lastValue &&
      options.length < this.props.maxResults
    ) {
      return;
    }

    this.setState({
      loadingState: "LOADING",
    });

    if (this._cancel) {
      this._cancel();
    }

    this._searchDebounced(value);
  };

  // $FlowFixMe
  _searchDebounced = debounce(async (value): void => {
    this.setState({
      loadingState: "LOADING",
    });

    const cancelDeferred = defer();
    this._cancel = () => {
      this._cancel = null;
      cancelDeferred.resolve();
    };

    const results = await this.search(value, cancelDeferred.promise);

    this._cancel = null;

    if (results) {
      this.setState({
        loadingState: "LOADED",
        options: results,
        lastValue: value,
      });
    } else {
      this.setState({
        loadingState: "INIT",
        options: [],
        lastValue: value,
      });
    }
  }, 500);

  renderOptions({
    optionsList,
    isFocused,
    isAllSelected,
  }: LayoutRendererProps) {
    const { alwaysShowOptions, fields } = this.props;
    const { loadingState } = this.state;
    if (alwaysShowOptions || isFocused) {
      if (optionsList) {
        return optionsList;
      } else if (this.hasList()) {
        if (isAllSelected) {
          return <EveryOptionState />;
        }
      } else if (this.isSearchable()) {
        if (loadingState === "LOADING") {
          return <LoadingState />;
        } else if (loadingState === "LOADED") {
          // $FlowFixMe all fields have a search field if this.isSearchable()
          return <NoMatchState fields={fields.map(this.searchField)} />;
        }
      }
    }
  }

  renderValue = (value: Value, options: FormattingOptions) => {
    const { fields, formatOptions } = this.props;
    return (
      <ValueComponent
        value={value}
        column={fields[0]}
        maximumFractionDigits={20}
        remap={fields.length === 1}
        {...formatOptions}
        // $FlowFixMe
        {...options}
      />
    );
  };

  render() {
    const {
      value,
      onChange,
      fields,
      multi,
      autoFocus,
      color,
      className,
      style,
      optionsMaxHeight,
    } = this.props;
    const { loadingState } = this.state;

    let { placeholder } = this.props;
    if (!placeholder) {
      const [field] = fields;
      if (this.hasList()) {
        placeholder = t`Search the list`;
      } else if (this.isSearchable()) {
        const names = new Set(
          // $FlowFixMe all fields have a search field if this.isSearchable()
          fields.map(field => stripId(this.searchField(field).display_name)),
        );
        if (names.size > 1) {
          placeholder = t`Search`;
        } else {
          // $FlowFixMe
          const [name] = names;
          placeholder = t`Search by ${name}`;
          if (field.isID() && field !== this.searchField(field)) {
            placeholder += t` or enter an ID`;
          }
        }
      } else {
        if (field.isID()) {
          placeholder = t`Enter an ID`;
        } else if (field.isNumeric()) {
          placeholder = t`Enter a number`;
        } else {
          placeholder = t`Enter some text`;
        }
      }
    }

    let options = [];
    if (this.hasList()) {
      options = dedupeValues(fields.map(field => field.values));
    } else if (this.isSearchable() && loadingState === "LOADED") {
      options = this.state.options;
    } else {
      options = [];
    }

    return (
      <div
        style={{
          width: this.props.expand ? this.props.maxWidth : null,
          minWidth: this.props.minWidth,
          maxWidth: this.props.maxWidth,
        }}
      >
        <TokenField
          value={value.filter(v => v != null)}
          onChange={onChange}
          placeholder={placeholder}
          updateOnInputChange
          // forwarded props
          multi={multi}
          autoFocus={autoFocus}
          color={color}
          style={style}
          className={className}
          optionsStyle={
            optionsMaxHeight !== undefined
              ? { maxHeight: optionsMaxHeight }
              : {}
          }
          // end forwarded props
          options={options}
          // $FlowFixMe
          valueKey={0}
          valueRenderer={value =>
            this.renderValue(value, { autoLoad: true, compact: false })
          }
          optionRenderer={option =>
            this.renderValue(option[0], { autoLoad: false })
          }
          layoutRenderer={props => (
            <div>
              {props.valuesList}
              {this.renderOptions(props)}
            </div>
          )}
          filterOption={(option, filterString) =>
            (option[0] != null &&
              String(option[0])
                .toLowerCase()
                .indexOf(filterString.toLowerCase()) === 0) ||
            (option[1] != null &&
              String(option[1])
                .toLowerCase()
                .indexOf(filterString.toLowerCase()) === 0)
          }
          onInputChange={this.onInputChange}
          parseFreeformValue={v => {
            // trim whitespace
            v = String(v || "").trim();
            // empty string is not valid
            if (!v) {
              return null;
            }
            // if the field is numeric we need to parse the string into an integer
            if (fields[0].isNumeric()) {
              if (/^-?\d+(\.\d+)?$/.test(v)) {
                return parseFloat(v);
              } else {
                return null;
              }
            }
            return v;
          }}
        />
      </div>
    );
  }
}

function dedupeValues(valuesList) {
  // $FlowFixMe
  const uniqueValueMap = new Map(valuesList.flat().map(o => [o[0], o]));
  return Array.from(uniqueValueMap.values());
}

const LoadingState = () => (
  <div
    className="flex layout-centered align-center border-bottom"
    style={{ minHeight: 82 }}
  >
    <LoadingSpinner size={32} />
  </div>
);

const NoMatchState = ({ fields }: { fields: Field[] }) => {
  if (fields.length > 1) {
    // if there is more than one field, don't name them
    return <OptionsMessage message={t`No matching result`} />;
  }
  const [{ display_name }] = fields;
  return (
    <OptionsMessage
      message={jt`No matching ${(
        <strong>&nbsp;{display_name}&nbsp;</strong>
      )} found.`}
    />
  );
};

const EveryOptionState = () => (
  <OptionsMessage
    message={t`Including every option in your filter probably won’t do much…`}
  />
);

const OptionsMessage = ({ message }) => (
  <div className="flex layout-centered p4 border-bottom">{message}</div>
);

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(FieldValuesWidget);
