import type { ReactNode } from "react";
import { t } from "ttag";

import { skipToken, useGetCollectionQuery } from "metabase/api";
import Link from "metabase/common/components/Link/Link";
import * as Urls from "metabase/lib/urls";
import type { StackProps } from "metabase/ui";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase-enterprise/data-studio/common/components/PaneHeader";
import type { Transform } from "metabase-types/api";

import { TransformMoreMenu } from "./TransformMoreMenu";
import { TransformNameInput } from "./TransformNameInput";
import { TransformTabs } from "./TransformTabs";

type TransformHeaderProps = {
  actions?: ReactNode;
  hasMenu?: boolean;
  isEditMode?: boolean;
  transform: Transform;
} & Omit<StackProps, "title">;

export function TransformHeader({
  transform,
  actions,
  hasMenu = true,
  isEditMode = false,
  ...restProps
}: TransformHeaderProps) {
  const { data: collection } = useGetCollectionQuery(
    transform.collection_id
      ? { id: transform.collection_id, namespace: "transforms" }
      : skipToken,
  );

  const folderPath =
    transform.collection_id && collection
      ? collection.effective_ancestors
        ? [...collection.effective_ancestors.slice(1), collection]
        : [collection]
      : [];

  return (
    <PaneHeader
      title={<TransformNameInput transform={transform} />}
      icon="transform"
      menu={hasMenu && <TransformMoreMenu transform={transform} />}
      tabs={!isEditMode && <TransformTabs transform={transform} />}
      actions={actions}
      data-testid="transforms-header"
      breadcrumbs={
        <DataStudioBreadcrumbs>
          <Link to={Urls.transformList()}>{t`Transforms`}</Link>
          {folderPath.map((folder) => (
            <Link
              key={folder.id}
              to={`${Urls.transformList()}?collectionId=${folder.id}`}
            >
              {folder.name}
            </Link>
          ))}
          {transform.name}
        </DataStudioBreadcrumbs>
      }
      showMetabotButton
      {...restProps}
    />
  );
}
