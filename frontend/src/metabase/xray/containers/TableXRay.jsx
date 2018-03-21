import React, { Component } from "react";
import { t } from "c-3po";
import { connect } from "react-redux";
import title from "metabase/hoc/Title";

import { fetchTableXray, initialize } from "metabase/xray/xray";
import { XRayPageWrapper } from "metabase/xray/components/XRayLayout";

import CostSelect from "metabase/xray/components/CostSelect";
import Constituent from "metabase/xray/components/Constituent";

import {
  getConstituents,
  getFeatures,
  getLoadingStatus,
  getError,
  getComparables,
  getIsAlreadyFetched,
} from "metabase/xray/selectors";

import Icon from "metabase/components/Icon";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import LoadingAnimation from "metabase/xray/components/LoadingAnimation";

import type { Table } from "metabase/meta/types/Table";

import { xrayLoadingMessages } from "metabase/xray/utils";
import { ComparisonDropdown } from "metabase/xray/components/ComparisonDropdown";

type Props = {
  fetchTableXray: () => void,
  initialize: () => {},
  constituents: [],
  isLoading: boolean,
  isAlreadyFetched: boolean,
  xray: {
    table: Table,
  },
  params: {
    tableId: number,
    cost: string,
  },
  error: {},
};

const mapStateToProps = state => ({
  features: getFeatures(state),
  constituents: getConstituents(state),
  comparables: getComparables(state),
  isLoading: getLoadingStatus(state),
  isAlreadyFetched: getIsAlreadyFetched(state),
  error: getError(state),
});

const mapDispatchToProps = {
  initialize,
  fetchTableXray,
};

@connect(mapStateToProps, mapDispatchToProps)
@title(({ features }) => (features && features.model.display_name) || t`Table`)
class TableXRay extends Component {
  props: Props;

  componentWillMount() {
    this.props.initialize();
    this.fetch();
  }

  componentWillUnmount() {
    // HACK Atte Keinänen 9/20/17: We need this for now because the structure of `state.xray.xray` isn't same
    // for all xray types and if switching to different kind of xray (= rendering different React container)
    // without resetting the state fails because `state.xray.xray` subproperty lookups fail
    this.props.initialize();
  }

  fetch() {
    const { params, fetchTableXray } = this.props;
    fetchTableXray(params.tableId, params.cost);
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.params.cost !== this.props.params.cost) {
      this.fetch();
    }
  }

  render() {
    const {
      comparables,
      constituents,
      features,
      params,
      isLoading,
      isAlreadyFetched,
      error,
    } = this.props;

    return (
      <LoadingAndErrorWrapper
        loading={isLoading || !isAlreadyFetched}
        error={error}
        noBackground
        loadingMessages={xrayLoadingMessages}
        loadingScenes={[<LoadingAnimation />]}
      >
        {() => (
          <XRayPageWrapper>
            <div className="full">
              <div className="my4 flex align-center py2">
                <div>
                  <h1 className="mt2 flex align-center">
                    {features.model.display_name}
                    <Icon
                      name="chevronright"
                      className="mx1 text-grey-3"
                      size={16}
                    />
                    <span className="text-grey-3">{t`XRay`}</span>
                  </h1>
                  <p className="m0 text-paragraph text-measure">
                    {features.model.description}
                  </p>
                </div>
                <div className="ml-auto flex align-center">
                  <h3 className="mr2">{t`Fidelity`}:</h3>
                  <CostSelect
                    xrayType="table"
                    currentCost={params.cost}
                    id={features.model.id}
                  />
                </div>
              </div>
              {comparables.length > 0 && (
                <ComparisonDropdown
                  models={[features.model]}
                  comparables={comparables}
                />
              )}
              <ol>
                {constituents.map((constituent, index) => (
                  <li key={index}>
                    <Constituent constituent={constituent} />
                  </li>
                ))}
              </ol>
            </div>
          </XRayPageWrapper>
        )}
      </LoadingAndErrorWrapper>
    );
  }
}

export default TableXRay;
