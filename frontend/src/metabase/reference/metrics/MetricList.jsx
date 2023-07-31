/* eslint "react/prop-types": "warn" */
import { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";

import S from "metabase/components/List/List.css";

import List from "metabase/components/List";
import ListItem from "metabase/components/ListItem";
import AdminAwareEmptyState from "metabase/components/AdminAwareEmptyState";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import MetabaseSettings from "metabase/lib/settings";
import * as metadataActions from "metabase/redux/metadata";
import ReferenceHeader from "../components/ReferenceHeader";

import { getMetrics, getError, getLoading } from "../selectors";

const emptyStateData = {
  title: t`Metrics are the official numbers that your team cares about`,
  adminMessage: t`Defining common metrics for your team makes it even easier to ask questions`,
  message: t`Metrics will appear here once your admins have created some`,
  image: "app/assets/img/metrics-list",
  adminAction: t`Learn how to create metrics`,
  adminLink: MetabaseSettings.docsUrl(
    "data-modeling/segments-and-metrics",
    "creating-a-metric",
  ),
};

const mapStateToProps = (state, props) => ({
  entities: getMetrics(state, props),
  loading: getLoading(state, props),
  loadingError: getError(state, props),
});

const mapDispatchToProps = {
  ...metadataActions,
};

class MetricList extends Component {
  static propTypes = {
    style: PropTypes.object.isRequired,
    entities: PropTypes.object.isRequired,
    loading: PropTypes.bool,
    loadingError: PropTypes.object,
  };

  render() {
    const { entities, style, loadingError, loading } = this.props;

    return (
      <div style={style} className="full">
        <ReferenceHeader name={t`Metrics`} />
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
                          description={entity.description}
                          url={`/reference/metrics/${entity.id}`}
                          icon="ruler"
                        />
                      ),
                  )}
                </List>
              </div>
            ) : (
              <div className={S.empty}>
                <AdminAwareEmptyState {...emptyStateData} />
              </div>
            )
          }
        </LoadingAndErrorWrapper>
      </div>
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(MetricList);
