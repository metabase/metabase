import cx from "classnames";
import { t } from "ttag";

import { skipToken, useListCardsQuery } from "metabase/api";
import { AdminAwareEmptyState } from "metabase/common/components/AdminAwareEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { modelIconMap } from "metabase/common/utils/icon";
import CS from "metabase/css/core/index.css";
import { selectMetadataProvider } from "metabase/metadata-store";
import { useSelector } from "metabase/redux";
import { List } from "metabase/reference/components/List";
import S from "metabase/reference/components/List/List.module.css";
import { ListItem } from "metabase/reference/components/ListItem";
import * as Urls from "metabase/urls";
import { visualizations } from "metabase/viz-core";
import type * as Lib from "metabase-lib";
import type { Segment, Table } from "metabase-types/api";

import ReferenceHeader from "../components/ReferenceHeader";
import { getDescription, getQuestionUrl } from "../utils";

const emptyStateData = (
  table: Table,
  segment: Segment,
  metadataProvider: Lib.MetadataProvider,
) => {
  return {
    message: t`Questions about this segment will appear here as they're added`,
    icon: "folder" as const,
    action: t`Ask a question`,
    link: getQuestionUrl({
      tableId: table.id,
      segmentId: segment.id,
      metadataProvider: metadataProvider,
    }),
  };
};

interface SegmentQuestionsProps {
  style?: React.CSSProperties;
  table: Table | undefined;
  segment: Segment | undefined;
}

export const SegmentQuestions = ({
  style,
  table,
  segment,
}: SegmentQuestionsProps) => {
  const metadataProvider = useSelector((state) =>
    selectMetadataProvider(state, table?.db_id ?? null),
  );
  const {
    data: cards = [],
    isLoading,
    error,
  } = useListCardsQuery(
    segment != null ? { f: "using_segment", model_id: segment.id } : skipToken,
  );

  return (
    <div style={style} className={CS.full}>
      <ReferenceHeader
        name={t`Questions about ${segment?.name}`}
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
