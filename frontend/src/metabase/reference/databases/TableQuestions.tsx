import cx from "classnames";
import { Component } from "react";
import { t } from "ttag";

import { AdminAwareEmptyState } from "metabase/common/components/AdminAwareEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { dayjs } from "metabase/dayjs";
import { selectMetadataProvider } from "metabase/metadata-store";
import { connect } from "metabase/redux";
import { List } from "metabase/reference/components/List";
import S from "metabase/reference/components/List/List.module.css";
import { ListItem } from "metabase/reference/components/ListItem";
import * as Urls from "metabase/urls";
import { visualizations } from "metabase/viz-core";
import type * as Lib from "metabase-lib";
import type { Card } from "metabase-types/api";

import ReferenceHeader from "../components/ReferenceHeader";
import type { ReferenceRouteProps, StateWithReference } from "../selectors";
import { getTable, getTableQuestions } from "../selectors";
import type { ReferenceLoadingProps, StubbedTable } from "../types";
import { getQuestionUrl } from "../utils";

const emptyStateData = (
  table: StubbedTable,
  metadataProvider: Lib.MetadataProvider,
) => {
  return {
    message: t`Questions about this table will appear here as they're added`,
    icon: "folder" as const,
    action: t`Ask a question`,
    link: getQuestionUrl({
      tableId: table.id,
      metadataProvider: metadataProvider,
    }),
  };
};

const mapStateToProps = (
  state: StateWithReference,
  props: ReferenceRouteProps,
) => ({
  table: getTable(state, props),
  entities: getTableQuestions(state, props),
  metadataProvider: selectMetadataProvider(
    state,
    getTable(state, props)?.db_id ?? null,
  ),
});

interface TableQuestionsProps {
  table: StubbedTable;
  metadataProvider: Lib.MetadataProvider;
  entities: Card[];
  loading?: boolean;
  loadingError?: unknown;
}

class TableQuestions extends Component<TableQuestionsProps> {
  render() {
    const { entities, loadingError, loading, table, metadataProvider } =
      this.props;

    return (
      <div>
        <ReferenceHeader
          name={t`Questions about ${this.props.table.display_name}`}
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
                          name={entity.name}
                          description={t`Created ${dayjs(
                            entity.created_at,
                          ).fromNow()} by ${entity.creator?.common_name ?? ""}`}
                          url={Urls.card(entity)}
                          icon={visualizations.get(entity.display)?.iconName}
                        />
                      ),
                  )}
                </List>
              </div>
            ) : (
              <div className={S.empty}>
                <AdminAwareEmptyState
                  {...emptyStateData(table, metadataProvider)}
                />
              </div>
            )
          }
        </LoadingAndErrorWrapper>
      </div>
    );
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  // Unjustified type cast. FIXME
)(
  // `connect` cannot match its inferred props against this component's own
  // props, because the `actions` spread in `mapDispatchToProps` is untyped.
  // The cast restores the props a caller actually passes.
  TableQuestions as unknown as React.ComponentType<
    ReferenceRouteProps & ReferenceLoadingProps
  >,
);
