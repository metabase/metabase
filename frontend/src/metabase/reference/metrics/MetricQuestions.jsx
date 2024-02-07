/* eslint "react/prop-types": "warn" */
import PropTypes from "prop-types";
import { connect } from "react-redux";
// eslint-disable-next-line no-restricted-imports -- deprecated usage
import moment from "moment-timezone";
import { t } from "ttag";
import visualizations from "metabase/visualizations";
import * as Urls from "metabase/lib/urls";

import { useQuestionListQuery } from "metabase/common/hooks";
import S from "metabase/components/List/List.css";

import List from "metabase/components/List";
import ListItem from "metabase/components/ListItem";
import AdminAwareEmptyState from "metabase/components/AdminAwareEmptyState";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import * as metadataActions from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";

import ReferenceHeader from "../components/ReferenceHeader";

import { getQuestionUrl } from "../utils";

import { getTable, getMetric } from "../selectors";

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

const getDescription = question => {
  const timestamp = moment(question.getCreatedAt()).fromNow();
  const author = question.getCreator().common_name;
  return t`Created ${timestamp} by ${author}`;
};

export const MetricQuestions = ({ style, table, metric, metadata }) => {
  const {
    data = [],
    isLoading,
    error,
  } = useQuestionListQuery({
    query: { f: "using_metric", model_id: metric.id },
    enabled: true,
  });

  return (
    <div style={style} className="full">
      <ReferenceHeader
        name={t`Questions about ${metric.name}`}
        type="questions"
        headerIcon="ruler"
      />
      <LoadingAndErrorWrapper loading={!error && isLoading} error={error}>
        {() =>
          data.length > 0 ? (
            <div className="wrapper wrapper--trim">
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
