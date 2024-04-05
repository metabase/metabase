/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";

import { useQuestionListQuery } from "metabase/common/hooks";
import AdminAwareEmptyState from "metabase/components/AdminAwareEmptyState";
import List from "metabase/components/List";
import S from "metabase/components/List/List.module.css";
import ListItem from "metabase/components/ListItem";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import * as Urls from "metabase/lib/urls";
import * as metadataActions from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import visualizations from "metabase/visualizations";

import ReferenceHeader from "../components/ReferenceHeader";
import { getTable, getMetric } from "../selectors";
import { getQuestionUrl, getDescription } from "../utils";

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
});

const mapDispatchToProps = {
  ...metadataActions,
};

export const MetricQuestions = ({ style, table, metric, metadata }) => {
  const {
    data = [],
    isLoading,
    error,
  } = useQuestionListQuery({
    query: { f: "using_metric", model_id: metric.id },
  });

  return (
    <div style={style} className={CS.full}>
      <ReferenceHeader
        name={t`Questions about ${metric.name}`}
        type="questions"
        headerIcon="ruler"
      />
      <LoadingAndErrorWrapper loading={!error && isLoading} error={error}>
        {() =>
          data.length > 0 ? (
            <div className={cx(CS.wrapper, CS.wrapperTrim)}>
              <List>
                {data.map(
                  question =>
                    question.id() &&
                    question.displayName() && (
                      <ListItem
                        key={question.id()}
                        name={question.displayName()}
                        description={getDescription(question)}
                        url={Urls.question(question.card())}
                        icon={visualizations.get(question.display()).iconName}
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
};

MetricQuestions.propTypes = {
  table: PropTypes.object,
  style: PropTypes.object.isRequired,
  metric: PropTypes.object.isRequired,
  metadata: PropTypes.object.isRequired,
};

export default connect(mapStateToProps, mapDispatchToProps)(MetricQuestions);
