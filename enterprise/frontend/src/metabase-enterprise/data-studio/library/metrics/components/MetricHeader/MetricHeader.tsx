import type { ReactNode } from "react";

import { Link } from "metabase/common/components/Link";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs/DataStudioBreadcrumbs";
import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase/data-studio/common/components/PaneHeader";
import { useCollectionPath } from "metabase/data-studio/common/hooks/use-collection-path/useCollectionPath";
import * as Urls from "metabase/lib/urls";
import type { Card } from "metabase-types/api";

import { MetricMoreMenu } from "./MetricMoreMenu";
import { MetricNameInput } from "./MetricNameInput";
import { MetricTabs } from "./MetricTabs";

type MetricHeaderProps = {
  card: Card;
  actions?: ReactNode;
};

export function MetricHeader({ card, actions }: MetricHeaderProps) {
  const { path, isLoadingPath } = useCollectionPath({
    collectionId: card.collection_id,
  });

  return (
    <PaneHeader
      data-testid="metric-header"
      title={
        card.can_write ? (
          <MetricNameInput card={card} />
        ) : (
          <PanelHeaderTitle>{card.name}</PanelHeaderTitle>
        )
      }
      icon="metric"
      menu={<MetricMoreMenu card={card} />}
      tabs={<MetricTabs card={card} />}
      actions={actions}
      breadcrumbs={
        <DataStudioBreadcrumbs loading={isLoadingPath}>
          {path?.map((collection, i) => (
            <Link
              key={collection.id}
              to={Urls.dataStudioLibrary({
                expandedIds: path.slice(1, i + 1).map((c) => c.id),
              })}
            >
              {collection.name}
            </Link>
          ))}
          <span>{card.name}</span>
        </DataStudioBreadcrumbs>
      }
    />
  );
}
