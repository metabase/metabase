/* eslint-disable react/prop-types */
import React from "react";
import { t, jt } from "ttag";
import cx from "classnames";

import { DashboardApi } from "metabase/services";
import Fields from "metabase/entities/fields";
import Tables from "metabase/entities/tables";

import Radio from "metabase/components/Radio";
import Toggle from "metabase/components/Toggle";
import InputBlurChange from "metabase/components/InputBlurChange";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import ParameterValueWidget from "metabase/parameters/components/ParameterValueWidget";
import Sidebar from "metabase/dashboard/components/Sidebar";

const tabs = [
  { value: "settings", name: t`Settings`, icon: "gear" },
  { value: "linked-filters", name: t`Linked filters`, icon: "link" },
];
class ParameterSidebar extends React.Component {
  state = { currentTab: "settings", originalParameter: null };

  componentDidMount() {
    this.setState({ originalParameter: this.props.parameter });
  }

  componentDidUpdate(prevProps) {
    if (this.props.parameter.id !== prevProps.parameter.id) {
      this.setState({ originalParameter: this.props.parameter });
    }
  }

  handleCancel = () => {
    this.props.setParameter(
      this.props.parameter.id,
      this.state.originalParameter,
    );
    this.props.done();
  };

  render() {
    const {
      parameter,
      otherParameters,
      remove,
      done,
      setName,
      setDefaultValue,
      setFilteringParameters,
    } = this.props;
    const { currentTab } = this.state;
    return (
      <Sidebar onClose={done} onCancel={this.handleCancel}>
        <div className="flex justify-evenly border-bottom">
          <Radio
            options={tabs}
            variant="underlined"
            value={currentTab}
            onChange={value => this.setState({ currentTab: value })}
          />
        </div>
        <div className="px2">
          {currentTab === "settings" ? (
            <div className="px2">
              <div className="py2">
                <label className="mt2 mb1 block text-bold">{t`Label`}</label>
                <InputBlurChange
                  className="input block full"
                  value={parameter.name}
                  onBlurChange={e => setName(e.target.value)}
                />
              </div>
              <label className="mt2 mb1 block text-bold">{t`Default value`}</label>
              <div className="pb2">
                <ParameterValueWidget
                  parameter={parameter}
                  name={parameter.name}
                  value={parameter.default}
                  setValue={setDefaultValue}
                  placeholder={t`No default`}
                  className="input bg-white"
                />
              </div>
              <a
                borderless
                className="mt2 block text-medium text-error-hover text-bold"
                onClick={remove}
              >
                {t`Remove`}
              </a>
            </div>
          ) : (
            <OtherParameterList
              showAddParameterPopover={this.props.showAddParameterPopover}
              parameter={parameter}
              otherParameters={otherParameters}
              setFilteringParameters={setFilteringParameters}
            />
          )}
        </div>
      </Sidebar>
    );
  }
}

class OtherParameterList extends React.Component {
  state = {
    expandedParameterId: null,
    columnPairs: [],
    loading: false,
    error: null,
  };

  componentDidUpdate(prevProps) {
    if (this.props.parameter.id !== prevProps.parameter.id) {
      this.setState({
        expandedParameterId: null,
        columnPairs: [],
        loading: false,
        error: null,
      });
    }
  }

  expandColumnPairs = async id => {
    if (id === this.state.expandedParameterId) {
      this.setState({ expandedParameterId: null, error: null });
      return;
    } else {
      this.setState({ expandedParameterId: id, loading: true, error: null });
    }

    const { parameter, otherParameters } = this.props;
    const filtered = parameter.field_ids;
    const parameterForId = otherParameters.find(p => p.id === id);
    const filtering = parameterForId.field_ids;
    if (filtered.length === 0 || filtering.length === 0) {
      const param = filtered.length === 0 ? parameter : parameterForId;
      const error = t`To view this, ${param.name} must be connected to at least one field.`;
      this.setState({ loading: false, error });
      return;
    }
    const result = await DashboardApi.validFilterFields({
      filtered,
      filtering,
    });
    const columnPairs = Object.entries(result).flatMap(
      ([filteredId, filteringIds]) =>
        filteringIds.map(filteringId => [filteringId, filteredId]),
    );

    this.setState({ columnPairs, loading: false });
  };

  render() {
    const {
      otherParameters,
      parameter: { filteringParameters = [] },
      setFilteringParameters,
      showAddParameterPopover,
    } = this.props;
    const { expandedParameterId, columnPairs } = this.state;
    return (
      <div className="py3 px2">
        <h3>{t`Limit this filter's choices`}</h3>
        {otherParameters.length === 0 ? (
          <div>
            <p className="text-medium">{t`If you have another dashboard filter, you can limit the choices that are listed for this filter based on the selection of the other one.`}</p>
            <p className="text-medium">{jt`So first, ${(
              <span
                onClick={showAddParameterPopover}
                className="cursor-pointer text-brand"
              >{t`add another dashboard filter`}</span>
            )}.`}</p>
          </div>
        ) : (
          <div>
            <p className="text-medium">{jt`If you toggle on one of these dashboard filters, selecting a value for that filter will limit the available choices for ${(
              <span className="text-italic">this</span>
            )} filter.`}</p>
            {otherParameters.map(({ id, name }) => (
              <div className={"bg-light rounded mb2"} key={name}>
                <div className="flex justify-between align-center p2">
                  <span
                    className="border-dashed-bottom text-bold cursor-pointer"
                    onClick={() => this.expandColumnPairs(id)}
                  >
                    {name}
                  </span>
                  <Toggle
                    value={(filteringParameters || []).includes(id)}
                    onChange={included =>
                      setFilteringParameters(
                        included
                          ? filteringParameters.concat(id)
                          : filteringParameters.filter(x => x !== id),
                      )
                    }
                  />
                </div>
                {id === expandedParameterId && (
                  <LoadingAndErrorWrapper
                    loading={this.state.loading}
                    error={this.state.error}
                    className="border-top text-small"
                  >
                    {columnPairs.map((row, index) => (
                      <div
                        key={index}
                        className={cx({ "border-top": index > 0 })}
                      >
                        {index === 0 && (
                          <div className="flex">
                            <div className="half text-brand px2 pt1">{t`Filtering column`}</div>
                            <div className="half text-brand px2 pt1">{t`Filtered column`}</div>
                          </div>
                        )}
                        <div className="flex">
                          {row.map(fieldId => (
                            <FieldAndTableName
                              fieldId={fieldId}
                              key={fieldId}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </LoadingAndErrorWrapper>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
}

function FieldAndTableName({ fieldId }) {
  return (
    <Fields.Loader id={fieldId}>
      {({ field }) => (
        <div className="half px2 py1">
          <div className="text-medium">
            <Tables.Loader id={field.table_id}>
              {({ table }) => <span>{table.display_name}</span>}
            </Tables.Loader>
          </div>
          <div>{field.display_name}</div>{" "}
        </div>
      )}
    </Fields.Loader>
  );
}

export default ParameterSidebar;
