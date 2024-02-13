/* eslint "react/prop-types": "warn" */
import { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
// eslint-disable-next-line no-restricted-imports -- deprecated usage
import moment from "moment-timezone";
import { t } from "ttag";
import visualizations from "metabase/visualizations";
import * as Urls from "metabase/lib/urls";

import S from "metabase/components/List/List.css";

import List from "metabase/components/List";
import ListItem from "metabase/components/ListItem";
import AdminAwareEmptyState from "metabase/components/AdminAwareEmptyState";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import * as metadataActions from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";

import ReferenceHeader from "../components/ReferenceHeader";

import { getQuestionUrl } from "../utils";

import {
  getMetricQuestions,
  getError,
  getLoading,
  getTable,
  getMetric,
} from "../selectors";

const emptyStateData = (table, metric, metadata) => {
  return {
    message: t`Questions about this metric will appear here as they're added`,
    icon: "all",
    action: t`Ask a question`,
    link: getQuestionUrl({
      dbId: table && table.db_id,
      tableId: metric.table_id,
      metricId: metric.id,
      metadata,
    }),
  };
};

const mapStateToProps = (state, props) => ({
  metric: getMetric(state, props),
  table: getTable(state, props),
  metadata: getMetadata(state),
  entities: getMetricQuestions(state, props),
  loading: getLoading(state, props),
  loadingError: getError(state, props),
});

const mapDispatchToProps = {
  ...metadataActions,
};

class MetricQuestions extends Component {
  static propTypes = {
    style: PropTypes.object.isRequired,
    entities: PropTypes.object.isRequired,
    loading: PropTypes.bool,
    loadingError: PropTypes.object,
    metric: PropTypes.object,
    table: PropTypes.object,
    metadata: PropTypes.object.isRequired,
  };

  render() {
    const { entities, style, loadingError, loading, table, metric, metadata } =
      this.props;

    return (
      <div style={style} className="full">
        <ReferenceHeader
          name={t`Questions about ${this.props.metric.name}`}
          type="questions"
          headerIcon="ruler"
        />
        <LoadingAndErrorWrapper
          loading={!loadingError && loading}
          error={loadingError}
        >
          {() =>
            Object.keys(entities).length > 0 ? (
              <div className="wrapper wrapper--trim">
                <List>
                  {Object.values(entities).map(
                    entity =>
                      entity &&
                      entity.id &&
                      entity.name && (
                        <ListItem
                          key={entity.id}
                          name={entity.display_name || entity.name}
                          description={t`Created ${moment(
                            entity.created_at,
                          ).fromNow()} by ${entity.creator.common_name}`}
                          url={Urls.question(entity)}
                          icon={visualizations.get(entity.display).iconName}
                        />
                      ),
                  )}
                </List>
              </div>
            ) : (
              <div className={S.empty}>
                <AdminAwareEmptyState
                  {...emptyStateData(table, metric, metadata)}
                />
              </div>
            )
          }
        </LoadingAndErrorWrapper>
      </div>
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(MetricQuestions);
