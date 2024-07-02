import cx from "classnames";
import type { CSSProperties } from "react";
import { t } from "ttag";

import AdminAwareEmptyState from "metabase/components/AdminAwareEmptyState";
import List from "metabase/components/List";
import S from "metabase/components/List/List.module.css";
import ListItem from "metabase/components/ListItem";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";

import ReferenceHeader from "../../components/ReferenceHeader";
import { getSegments, getError, getLoading } from "../../selectors";

const emptyStateData = {
  title: t`Segments are interesting subsets of tables`,
  adminMessage: t`Defining common segments for your team makes it even easier to ask questions`,
  message: t`Segments will appear here once your admins have created some`,
  image: "app/assets/img/segments-list",
  adminAction: t`Learn how to create segments`,
};

interface SegmentListProps {
  style?: CSSProperties;
}

export function SegmentList({ style }: SegmentListProps) {
  const entities = useSelector(getSegments);
  const loading = useSelector(getLoading);
  const loadingError = useSelector(getError);
  const adminLink = useSelector(state =>
    getDocsUrl(state, {
      page: "data-modeling/segments-and-metrics",
      anchor: "creating-a-segment",
    }),
  );
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  return (
    <div style={style} className={CS.full}>
      <ReferenceHeader name={t`Segments`} />
      <LoadingAndErrorWrapper
        loading={!loadingError && loading}
        error={loadingError}
      >
        {() =>
          Object.keys(entities).length > 0 ? (
            <div className={cx(CS.wrapper, CS.wrapperTrim)}>
              <List>
                {Object.values(entities).map(
                  entity =>
                    entity &&
                    entity.id &&
                    entity.name && (
                      <ListItem
                        key={entity.id}
                        name={entity.name}
                        description={entity.description}
                        url={`/reference/segments/${entity.id}`}
                        icon="segment"
                      />
                    ),
                )}
              </List>
            </div>
          ) : (
            <div className={S.empty}>
              <AdminAwareEmptyState
                {...emptyStateData}
                adminLink={showMetabaseLinks ? adminLink : undefined}
              />
            </div>
          )
        }
      </LoadingAndErrorWrapper>
    </div>
  );
}
