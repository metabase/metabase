import React, { Component } from "react";
import { connect } from "react-redux";
import { fetchMetrics, fetchDatabases } from "metabase/redux/metadata";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import EntitySearch from "metabase/containers/EntitySearch";
import { getMetadata } from "metabase/selectors/metadata";
import _ from "underscore";
import { t } from "c-3po";
import type { Metric } from "metabase/meta/types/Metric";
import type Metadata from "metabase-lib/lib/metadata/Metadata";
import EmptyState from "metabase/components/EmptyState";

import type { StructuredQuery } from "metabase/meta/types/Query";
import { getCurrentQuery } from "metabase/new_query/selectors";
import { resetQuery } from "../new_query";

import Metrics from "metabase/entities/metrics";
import Databases from "metabase/entities/databases";

const mapStateToProps = state => ({
  query: getCurrentQuery(state),
  metadata: getMetadata(state),
  isLoading:
    Metrics.selectors.getLoading(state) ||
    Databases.selectors.getLoading(state, {
      // must match entityQuery used by fetchDatabases
      entityQuery: { include_tables: true, include_cards: true },
    }),
});
const mapDispatchToProps = {
  fetchMetrics,
  fetchDatabases,
  resetQuery,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class MetricSearch extends Component {
  props: {
    getUrlForQuery: StructuredQuery => void,
    backButtonUrl: string,

    query: StructuredQuery,
    metadata: Metadata,
    isLoading: boolean,
    fetchMetrics: () => void,
    fetchDatabases: () => void,
    resetQuery: () => void,
  };

  componentDidMount() {
    this.props.fetchDatabases(); // load databases if not loaded yet
    this.props.fetchMetrics(true); // metrics may change more often so always reload them
    this.props.resetQuery();
  }

  getUrlForMetric = (metric: Metric) => {
    const updatedQuery = this.props.query
      .setDatabase(metric.table.db)
      .setTable(metric.table)
      .addAggregation(metric.aggregationClause());

    return this.props.getUrlForQuery(updatedQuery);
  };

  render() {
    const { backButtonUrl, isLoading, metadata } = this.props;

    return (
      <LoadingAndErrorWrapper loading={isLoading}>
        {() => {
          const sortedActiveMetrics = _.chain(metadata.metricsList())
            // Metric shouldn't be retired and it should refer to an existing table
            .filter(metric => metric.isActive() && metric.table)
            .sortBy(({ name }) => name.toLowerCase())
            .value();

          if (sortedActiveMetrics.length > 0) {
            return (
              <EntitySearch
                title={t`Which metric?`}
                // TODO Atte Keinänen 8/22/17: If you call `/api/table/:id/table_metadata` it returns
                // all metrics (also retired ones) and is missing `archived` prop. Currently this
                // filters them out but we should definitely update the endpoints in the upcoming metadata API refactoring.
                entities={sortedActiveMetrics}
                getUrlForEntity={this.getUrlForMetric}
                backButtonUrl={backButtonUrl}
              />
            );
          } else {
            return (
              <div className="mt2 flex-full flex align-center justify-center">
                <EmptyState
                  message={
                    <span>
                      {t`Defining common metrics for your team makes it even easier to ask questions`}
                    </span>
                  }
                  image="app/img/metrics_illustration"
                  action={t`How to create metrics`}
                  link="http://www.metabase.com/docs/latest/administration-guide/07-segments-and-metrics.html"
                  className="mt2"
                  imageClassName="mln2"
                />
              </div>
            );
          }
        }}
      </LoadingAndErrorWrapper>
    );
  }
}
