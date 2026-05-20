import cx from "classnames";
import { t } from "ttag";

import { AdminAwareEmptyState } from "metabase/common/components/AdminAwareEmptyState";
import { List } from "metabase/common/components/List";
import S from "metabase/common/components/List/List.module.css";
import { ListItem } from "metabase/common/components/ListItem";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useQuestionListQuery } from "metabase/common/hooks";
import { modelIconMap } from "metabase/common/utils/icon";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import * as Urls from "metabase/urls";
import visualizations from "metabase/visualizations";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import ReferenceHeader from "../components/ReferenceHeader";
import type { ReferenceRouteProps, StateWithReference } from "../selectors";
import { getSegment, getTableBySegment } from "../selectors";
import type { StubbedSegment, StubbedTable } from "../types";
import { getDescription, getQuestionUrl } from "../utils";

const emptyStateData = (
  table: StubbedTable,
  segment: StubbedSegment,
  metadata: Metadata,
) => {
  return {
    message: t`Questions about this segment will appear here as they're added`,
    icon: "folder" as const,
    action: t`Ask a question`,
    link: getQuestionUrl({
      dbId: table.db_id!,
      tableId: segment.table_id!,
      segmentId: segment.id,
      metadata,
    }),
  };
};

const mapStateToProps = (
  state: StateWithReference,
  props: ReferenceRouteProps,
) => ({
  segment: getSegment(state, props),
  table: getTableBySegment(state, props),
  metadata: getMetadata(state),
});

const mapDispatchToProps = {
  ...metadataActions,
};

interface SegmentQuestionsInnerProps {
  style: React.CSSProperties;
  table: StubbedTable;
  segment: StubbedSegment;
  metadata: Metadata;
}

const SegmentQuestionsInner = ({
  style,
  table,
  segment,
  metadata,
}: SegmentQuestionsInnerProps) => {
  const {
    data = [],
    isLoading,
    error,
  } = useQuestionListQuery({
    query: { f: "using_segment" as any, model_id: segment.id },
  });

  return (
    <div style={style} className={CS.full}>
      <ReferenceHeader
        name={t`Questions about ${segment.name}`}
        type="questions"
        headerIcon={modelIconMap.segment}
      />
      <LoadingAndErrorWrapper loading={!error && isLoading} error={error}>
        {() =>
          data.length > 0 ? (
            <div className={cx(CS.wrapper, CS.wrapperTrim)}>
              <List>
                {data.map(
                  (question) =>
                    question.id() &&
                    question.displayName() && (
                      <ListItem
                        key={question.id()}
                        name={question.displayName() ?? ""}
                        description={getDescription(question)}
                        url={Urls.card(question.card())}
                        icon={visualizations.get(question.display())?.iconName}
                      />
                    ),
                )}
              </List>
            </div>
          ) : (
            <div className={S.empty}>
              {table && segment && metadata && (
                <AdminAwareEmptyState
                  {...emptyStateData(table, segment, metadata)}
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
  mapDispatchToProps,
)(SegmentQuestionsInner as unknown as React.ComponentType);
