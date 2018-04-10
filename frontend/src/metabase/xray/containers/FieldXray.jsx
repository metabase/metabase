/* @flow */
import React, { Component } from "react";

import { connect } from "react-redux";
import title from "metabase/hoc/Title";
import { Link } from "react-router";
import { t } from "c-3po";
import { isDate } from "metabase/lib/schema_metadata";
import { fetchFieldXray, initialize } from "metabase/xray/xray";
import {
  getLoadingStatus,
  getError,
  getFeatures,
  getIsAlreadyFetched,
} from "metabase/xray/selectors";

import { ROBOTS, STATS_OVERVIEW, VALUES_OVERVIEW } from "metabase/xray/stats";

import Icon from "metabase/components/Icon";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CostSelect from "metabase/xray/components/CostSelect";
import StatGroup from "metabase/xray/components/StatGroup";
import Histogram from "metabase/xray/Histogram";
import { Heading, XRayPageWrapper } from "metabase/xray/components/XRayLayout";

import { xrayLoadingMessages } from "metabase/xray/utils";

import Periodicity from "metabase/xray/components/Periodicity";
import LoadingAnimation from "metabase/xray/components/LoadingAnimation";

import type { Field } from "metabase/meta/types/Field";
import type { Table } from "metabase/meta/types/Table";
import { Insights } from "metabase/xray/components/Insights";

type Props = {
  fetchFieldXray: () => void,
  initialize: () => {},
  isLoading: boolean,
  isAlreadyFetched: boolean,
  features: {
    model: Field,
    table: Table,
    histogram: {
      value: {},
    },
    insights: [],
  },
  params: {
    cost: string,
    fieldId: number,
  },
  error: {},
};

const mapStateToProps = state => ({
  features: getFeatures(state),
  isLoading: getLoadingStatus(state),
  isAlreadyFetched: getIsAlreadyFetched(state),
  error: getError(state),
});

const mapDispatchToProps = {
  initialize,
  fetchFieldXray,
};

@connect(mapStateToProps, mapDispatchToProps)
@title(({ features }) => (features && features.model.display_name) || t`Field`)
class FieldXRay extends Component {
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
    const { params, fetchFieldXray } = this.props;
    fetchFieldXray(params.fieldId, params.cost);
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.params.cost !== this.props.params.cost) {
      this.fetch();
    }
  }

  render() {
    const { features, params, isLoading, isAlreadyFetched, error } = this.props;

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
              <div className="my3 flex align-center">
                <div className="full">
                  <Link
                    className="my2 px2 text-bold text-brand-hover inline-block bordered bg-white p1 h4 no-decoration rounded shadowed"
                    to={`/xray/table/${features.table.id}/approximate`}
                  >
                    {features.table.display_name}
                  </Link>
                  <div className="mt2 flex align-center">
                    <h1 className="flex align-center">
                      {features.model.display_name}
                      <Icon
                        name="chevronright"
                        className="mx1 text-grey-3"
                        size={16}
                      />
                      <span className="text-grey-3">{t`X-ray`}</span>
                    </h1>
                    <div className="ml-auto flex align-center">
                      <h3 className="mr2 text-grey-3">{t`Fidelity`}</h3>
                      <CostSelect
                        xrayType="field"
                        id={features.model.id}
                        currentCost={params.cost}
                      />
                    </div>
                  </div>
                  <p className="mt1 text-paragraph text-measure">
                    {features.model.description}
                  </p>
                </div>
              </div>
              {features["insights"] && (
                <div className="mt4">
                  <Heading heading="Takeaways" />
                  <Insights features={features} />
                </div>
              )}
              <div className="mt4">
                <Heading heading={t`Distribution`} />
                <div className="bg-white bordered shadowed">
                  <div className="lg-p4">
                    <div style={{ height: 300 }}>
                      {features.histogram.value && (
                        <Histogram histogram={features.histogram.value} />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {isDate(features.model) && <Periodicity xray={features} />}

              <StatGroup
                heading={t`Values overview`}
                xray={features}
                stats={VALUES_OVERVIEW}
              />

              <StatGroup
                heading={t`Statistical overview`}
                xray={features}
                showDescriptions
                stats={STATS_OVERVIEW}
              />

              <StatGroup
                heading={t`Robots`}
                xray={features}
                showDescriptions
                stats={ROBOTS}
              />
            </div>
          </XRayPageWrapper>
        )}
      </LoadingAndErrorWrapper>
    );
  }
}

export default FieldXRay;
