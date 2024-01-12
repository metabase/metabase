import type { CSSProperties } from "react";
import { t } from "ttag";

import S from "metabase/components/List/List.css";

import List from "metabase/components/List";
import ListItem from "metabase/components/ListItem";
import AdminAwareEmptyState from "metabase/components/AdminAwareEmptyState";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import { useSelector } from "metabase/lib/redux";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { getDocsUrl } from "metabase/selectors/settings";
import ReferenceHeader from "../../components/ReferenceHeader";

import { getMetrics, getError, getLoading } from "../../selectors";

const emptyStateData = {
  title: t`Metrics are the official numbers that your team cares about`,
  adminMessage: t`Defining common metrics for your team makes it even easier to ask questions`,
  message: t`Metrics will appear here once your admins have created some`,
  image: "app/assets/img/metrics-list",
  adminAction: t`Learn how to create metrics`,
};

interface MetricListProps {
  style?: CSSProperties;
}

export function MetricList({ style }: MetricListProps) {
  const entities = useSelector(getMetrics);
  const loading = useSelector(getLoading);
  const loadingError = useSelector(getError);
  const adminLink = useSelector(state =>
    getDocsUrl(state, {
      page: "data-modeling/segments-and-metrics",
      anchor: "creating-a-metric",
    }),
  );
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  return (
    <div style={style} className="full">
      <ReferenceHeader name={t`Metrics`} />
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
                        name={entity.name}
                        description={entity.description}
                        url={`/reference/metrics/${entity.id}`}
                        icon="ruler"
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
