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
import type { Card, Table } from "metabase-types/api";

import ReferenceHeader from "../components/ReferenceHeader";
import type { StateWithReference } from "../selectors";
import type { ReferenceLoadingProps } from "../types";
import { getQuestionUrl } from "../utils";

const emptyStateData = (
  table: Table,
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
  props: Pick<TableQuestionsProps, "table">,
) => ({
  metadataProvider: selectMetadataProvider(state, props.table?.db_id ?? null),
});

interface TableQuestionsProps {
  table: Table | undefined;
  metadataProvider: Lib.MetadataProvider;
  cards: Card[];
  loading?: boolean;
  loadingError?: unknown;
}

class TableQuestions extends Component<TableQuestionsProps> {
  render() {
    const { cards, loadingError, loading, table, metadataProvider } =
      this.props;

    const questions = cards.filter((card) => card.table_id === table?.id);

    return (
      <div>
        <ReferenceHeader
          name={t`Questions about ${table?.display_name}`}
          headerIcon="table2"
        />
        <LoadingAndErrorWrapper
          loading={!loadingError && loading}
          error={loadingError}
        >
          {() =>
            questions.length > 0 ? (
              <div className={cx(CS.wrapper, CS.wrapperTrim)}>
                <List>
                  {questions.map((question) => (
                    <ListItem
                      key={question.id}
                      name={question.name}
                      description={t`Created ${dayjs(
                        question.created_at,
                      ).fromNow()} by ${question.creator?.common_name ?? ""}`}
                      url={Urls.card(question)}
                      icon={visualizations.get(question.display)?.iconName}
                    />
                  ))}
                </List>
              </div>
            ) : (
              <div className={S.empty}>
                {table && (
                  <AdminAwareEmptyState
                    {...emptyStateData(table, metadataProvider)}
                  />
                )}
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
    ReferenceLoadingProps & Pick<TableQuestionsProps, "table" | "cards">
  >,
);
