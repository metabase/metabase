/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import dayjs from "dayjs";
import PropTypes from "prop-types";
import { Component } from "react";
import { t } from "ttag";

import { AdminAwareEmptyState } from "metabase/common/components/AdminAwareEmptyState";
import { List } from "metabase/common/components/List";
import S from "metabase/common/components/List/List.module.css";
import { ListItem } from "metabase/common/components/ListItem";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import * as metadataActions from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import visualizations from "metabase/visualizations";

import ReferenceHeader from "../components/ReferenceHeader";
import {
  getError,
  getLoading,
  getTable,
  getTableQuestions,
} from "../selectors";
import { getQuestionUrl } from "../utils";

const emptyStateData = (table, metadata) => {
  return {
    message: t`Questions about this table will appear here as they're added`,
    icon: "folder",
    action: t`Ask a question`,
    link: getQuestionUrl({
      dbId: table.db_id,
      tableId: table.id,
      metadata,
    }),
  };
};

const mapStateToProps = (state, props) => ({
  table: getTable(state, props),
  entities: getTableQuestions(state, props),
  loading: getLoading(state, props),
  loadingError: getError(state, props),
  metadata: getMetadata(state),
});

const mapDispatchToProps = {
  ...metadataActions,
};

class TableQuestions extends Component {
  static propTypes = {
    table: PropTypes.object.isRequired,
    metadata: PropTypes.object.isRequired,
    entities: PropTypes.object.isRequired,
    loading: PropTypes.bool,
    loadingError: PropTypes.object,
  };

  render() {
    const { entities, loadingError, loading, table, metadata } = this.props;

    return (
      <div>
        <ReferenceHeader
          name={t`Questions about ${this.props.table.display_name}`}
          type="questions"
          headerIcon="table2"
        />
        <LoadingAndErrorWrapper
          loading={!loadingError && loading}
          error={loadingError}
        >
          {() =>
            Object.keys(entities).length > 0 ? (
              <div className={cx(CS.wrapper, CS.wrapperTrim)}>
                <List>
                  {Object.values(entities).map(
                    (entity) =>
                      entity &&
                      entity.id &&
                      entity.name && (
                        <ListItem
                          key={entity.id}
                          name={entity.display_name || entity.name}
                          description={t`Created ${dayjs(
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
                <AdminAwareEmptyState {...emptyStateData(table, metadata)} />
              </div>
            )
          }
        </LoadingAndErrorWrapper>
      </div>
    );
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(TableQuestions);
