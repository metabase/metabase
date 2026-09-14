import cx from "classnames";
import { t } from "ttag";

import { useListCardsQuery } from "metabase/api";
import { AdminAwareEmptyState } from "metabase/common/components/AdminAwareEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { modelIconMap } from "metabase/common/utils/icon";
import CS from "metabase/css/core/index.css";
import { selectMetadataProvider } from "metabase/metadata-store";
import { connect } from "metabase/redux";
import { List } from "metabase/reference/components/List";
import S from "metabase/reference/components/List/List.module.css";
import { ListItem } from "metabase/reference/components/ListItem";
import * as Urls from "metabase/urls";
import { visualizations } from "metabase/viz-core";
import type * as Lib from "metabase-lib";

import ReferenceHeader from "../components/ReferenceHeader";
import type { ReferenceRouteProps, StateWithReference } from "../selectors";
import { getSegment, getTableBySegment } from "../selectors";
import type { StubbedSegment, StubbedTable } from "../types";
import { getDescription, getQuestionUrl } from "../utils";

const emptyStateData = (
  table: StubbedTable,
  segment: StubbedSegment,
  metadataProvider: Lib.MetadataProvider,
) => {
  return {
    message: t`Questions about this segment will appear here as they're added`,
    icon: "folder" as const,
    action: t`Ask a question`,
    link: getQuestionUrl({
      tableId: segment.table_id!,
      segmentId: segment.id,
      metadataProvider: metadataProvider,
    }),
  };
};

const mapStateToProps = (
  state: StateWithReference,
  props: ReferenceRouteProps,
) => ({
  segment: getSegment(state, props),
  table: getTableBySegment(state, props),
  metadataProvider: selectMetadataProvider(
    state,
    getTableBySegment(state, props)?.db_id ?? null,
  ),
});

interface SegmentQuestionsInnerProps {
  style: React.CSSProperties;
  table: StubbedTable;
  segment: StubbedSegment;
  metadataProvider: Lib.MetadataProvider;
}

const SegmentQuestionsInner = ({
  style,
  table,
  segment,
  metadataProvider,
}: SegmentQuestionsInnerProps) => {
  const {
    data: cards = [],
    isLoading,
    error,
  } = useListCardsQuery({ f: "using_segment", model_id: segment.id });

  return (
    <div style={style} className={CS.full}>
      <ReferenceHeader
        name={t`Questions about ${segment.name}`}
        headerIcon={modelIconMap.segment}
      />
      <LoadingAndErrorWrapper loading={!error && isLoading} error={error}>
        {() =>
          cards.length > 0 ? (
            <div className={cx(CS.wrapper, CS.wrapperTrim)}>
              <List>
                {cards.map(
                  (card) =>
                    card.id &&
                    card.name && (
                      <ListItem
                        key={card.id}
                        name={card.name}
                        description={getDescription(card)}
                        url={Urls.card(card)}
                        icon={visualizations.get(card.display)?.iconName}
                      />
                    ),
                )}
              </List>
            </div>
          ) : (
            <div className={S.empty}>
              {table && segment && (
                <AdminAwareEmptyState
                  {...emptyStateData(table, segment, metadataProvider)}
                />
              )}
            </div>
          )
        }
      </LoadingAndErrorWrapper>
    </div>
  );
};

export const SegmentQuestions = connect(
  mapStateToProps,
  // Unjustified type cast. FIXME
)(SegmentQuestionsInner as unknown as React.ComponentType);
