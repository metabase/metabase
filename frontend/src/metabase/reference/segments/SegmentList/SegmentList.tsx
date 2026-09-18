import cx from "classnames";
import type { CSSProperties } from "react";
import { t } from "ttag";

import { useListSegmentsQuery } from "metabase/api";
import { AdminAwareEmptyState } from "metabase/common/components/AdminAwareEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { modelIconMap } from "metabase/common/utils/icon";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/redux";
import { List } from "metabase/reference/components/List";
import S from "metabase/reference/components/List/List.module.css";
import { ListItem } from "metabase/reference/components/ListItem";
import { getDocsUrl } from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";

import ReferenceHeader from "../../components/ReferenceHeader";

const emptyStateData = {
  get title() {
    return t`Segments are interesting subsets of tables`;
  },
  get adminMessage() {
    return t`Defining common segments for your team makes it even easier to ask questions`;
  },
  get message() {
    return t`Segments will appear here once your admins have created some`;
  },
  image: "app/assets/img/segments-list",
  get adminAction() {
    return t`Learn how to create segments`;
  },
};

interface SegmentListProps {
  style?: CSSProperties;
}

export function SegmentList({ style }: SegmentListProps) {
  const { data: segments = [], isLoading, error } = useListSegmentsQuery();
  const adminLink = useSelector((state) =>
    getDocsUrl(state, {
      page: "data-modeling/segments",
      anchor: "creating-a-segment",
    }),
  );
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  return (
    <div style={style} className={CS.full}>
      <ReferenceHeader name={t`Segments`} />
      <LoadingAndErrorWrapper loading={!error && isLoading} error={error}>
        {() =>
          segments.length > 0 ? (
            <div className={cx(CS.wrapper, CS.wrapperTrim)}>
              <List>
                {segments.map((segment) => (
                  <ListItem
                    key={segment.id}
                    name={segment.name}
                    description={segment.description}
                    url={`/reference/segments/${segment.id}`}
                    icon={modelIconMap.segment}
                  />
                ))}
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
