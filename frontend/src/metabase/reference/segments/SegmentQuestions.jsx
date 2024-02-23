/* eslint "react/prop-types": "warn" */
import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import PropTypes from "prop-types";
import { Component } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import AdminAwareEmptyState from "metabase/components/AdminAwareEmptyState";
import List from "metabase/components/List";
import S from "metabase/components/List/List.css";
import ListItem from "metabase/components/ListItem";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import * as metadataActions from "metabase/redux/metadata";
import visualizations from "metabase/visualizations";

import ReferenceHeader from "../components/ReferenceHeader";
import {
  getSegmentQuestions,
  getError,
  getLoading,
  getTableBySegment,
  getSegment,
} from "../selectors";
import { getQuestionUrl } from "../utils";

const emptyStateData = (table, segment) => {
  return {
    message: t`Questions about this segment will appear here as they're added`,
    icon: "folder",
    action: t`Ask a question`,
    link: getQuestionUrl({
      dbId: table && table.db_id,
      tableId: segment.table_id,
      segmentId: segment.id,
    }),
  };
};
const mapStateToProps = (state, props) => ({
  segment: getSegment(state, props),
  table: getTableBySegment(state, props),
  entities: getSegmentQuestions(state, props),
  loading: getLoading(state, props),
  loadingError: getError(state, props),
});

const mapDispatchToProps = {
  ...metadataActions,
};

class SegmentQuestions extends Component {
  static propTypes = {
    table: PropTypes.object.isRequired,
    segment: PropTypes.object.isRequired,
    style: PropTypes.object.isRequired,
    entities: PropTypes.object.isRequired,
    loading: PropTypes.bool,
    loadingError: PropTypes.object,
  };

  render() {
    const { entities, style, loadingError, loading } = this.props;

    return (
      <div style={style} className="full">
        <ReferenceHeader
          name={t`Questions about ${this.props.segment.name}`}
          type="questions"
          headerIcon="segment"
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
                  {...emptyStateData(this.props.table, this.props.segment)}
                />
              </div>
            )
          }
        </LoadingAndErrorWrapper>
      </div>
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(SegmentQuestions);
