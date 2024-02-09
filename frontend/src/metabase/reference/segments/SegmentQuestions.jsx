/* eslint "react/prop-types": "warn" */
import PropTypes from "prop-types";
import { connect } from "react-redux";
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

import { getQuestionUrl, getDescription } from "../utils";

import { getTableBySegment, getSegment } from "../selectors";

const emptyStateData = (table, segment, metadata) => {
  return {
    message: t`Questions about this segment will appear here as they're added`,
    icon: "folder",
    action: t`Ask a question`,
    link: getQuestionUrl({
      dbId: table && table.db_id,
      tableId: segment.table_id,
      segmentId: segment.id,
      metadata,
    }),
  };
};
const mapStateToProps = (state, props) => ({
  segment: getSegment(state, props),
  table: getTableBySegment(state, props),
  metadata: getMetadata(state),
});

const mapDispatchToProps = {
  ...metadataActions,
};

export const SegmentQuestions = ({ style, table, segment, metadata }) => {
  const {
    data = [],
    isLoading,
    error,
  } = useQuestionListQuery({
    query: { f: "using_segment", model_id: segment.id },
  });

  return (
    <div style={style} className="full">
      <ReferenceHeader
        name={t`Questions about ${segment.name}`}
        type="questions"
        headerIcon="segment"
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
                {...emptyStateData(table, segment, metadata)}
              />
            </div>
          )
        }
      </LoadingAndErrorWrapper>
    </div>
  );
};

SegmentQuestions.propTypes = {
  table: PropTypes.object,
  segment: PropTypes.object.isRequired,
  style: PropTypes.object.isRequired,
  metadata: PropTypes.object.isRequired,
};

export default connect(mapStateToProps, mapDispatchToProps)(SegmentQuestions);
