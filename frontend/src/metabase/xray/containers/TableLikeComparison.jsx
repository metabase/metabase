import React, { Component } from "react";
import { connect } from "react-redux";
import _ from "underscore";

import {
  fetchSharedTypeComparisonXray,
  fetchTwoTypesComparisonXray,
  initialize,
} from "metabase/xray/xray";
import {
  getComparison,
  getComparisonFields,
  getComparisonContributors,
  getModelItem,
  getLoadingStatus,
  getError,
  getTitle,
} from "metabase/xray/selectors";

import title from "metabase/hoc/Title";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import XRayComparison from "metabase/xray/components/XRayComparison";
import LoadingAnimation from "metabase/xray/components/LoadingAnimation";

import { hasComparison, comparisonLoadingMessages } from "metabase/xray/utils";

@connect(null, { fetchSharedTypeComparisonXray })
export class SharedTypeComparisonXRay extends Component {
  render() {
    const { modelTypePlural, modelId1, modelId2, cost } = this.props.params;

    return (
      <TableLikeComparisonXRay
        fetchTableLikeComparisonXray={() =>
          this.props.fetchSharedTypeComparisonXray(
            modelTypePlural,
            modelId1,
            modelId2,
            cost,
          )
        }
      />
    );
  }
}

@connect(null, { fetchTwoTypesComparisonXray })
export class TwoTypesComparisonXRay extends Component {
  render() {
    const {
      modelType1,
      modelId1,
      modelType2,
      modelId2,
      cost,
    } = this.props.params;

    return (
      <TableLikeComparisonXRay
        fetchTableLikeComparisonXray={() =>
          this.props.fetchTwoTypesComparisonXray(
            modelType1,
            modelId1,
            modelType2,
            modelId2,
            cost,
          )
        }
      />
    );
  }
}

const mapStateToProps = state => ({
  comparison: getComparison(state),
  fields: getComparisonFields(state),
  contributors: getComparisonContributors(state),
  itemA: getModelItem(state, 0),
  itemB: getModelItem(state, 1),
  isLoading: getLoadingStatus(state),
  error: getError(state),
});

const mapDispatchToProps = {
  initialize,
};

@connect(mapStateToProps, mapDispatchToProps)
@title(props => getTitle(props))
export class TableLikeComparisonXRay extends Component {
  props: {
    initialize: () => void,
    fetchTableLikeComparisonXray: () => void,
  };

  componentWillMount() {
    this.props.initialize();
    this.props.fetchTableLikeComparisonXray();
  }

  componentWillUnmount() {
    // HACK Atte Keinänen 9/20/17: We need this for now because the structure of `state.xray.xray` isn't same
    // for all xray types and if switching to different kind of xray (= rendering different React container)
    // without resetting the state fails because `state.xray.xray` subproperty lookups fail
    this.props.initialize();
  }

  render() {
    const {
      comparison,
      contributors,
      error,
      fields,
      isLoading,
      itemA,
      itemB,
      cost,
    } = this.props;

    return (
      <LoadingAndErrorWrapper
        loading={isLoading || !hasComparison(comparison)}
        error={error}
        noBackground
        loadingMessages={comparisonLoadingMessages}
        loadingScenes={[<LoadingAnimation />]}
      >
        {() => (
          <XRayComparison
            cost={cost}
            fields={_.sortBy(fields, "distance").reverse()}
            comparisonFields={["Difference", "Entropy", "Histogram", "Nil%"]}
            contributors={contributors}
            comparables={comparison.comparables}
            comparison={comparison.comparison}
            itemA={itemA}
            itemB={itemB}
          />
        )}
      </LoadingAndErrorWrapper>
    );
  }
}
