import type { ReactNode } from "react";
import { t } from "ttag";

import Link from "metabase/common/components/Link/Link";
import * as Urls from "metabase/lib/urls";
import type { GroupProps } from "metabase/ui";
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
} & Omit<GroupProps, "title">;

export function TransformHeader({
  transform,
  actions,
  hasMenu = true,
  isEditMode = false,
  ...restProps
}: TransformHeaderProps) {
  return (
    <PaneHeader
      px={0}
      py={0}
      title={<TransformNameInput transform={transform} />}
      icon="transform"
      menu={hasMenu && <TransformMoreMenu transform={transform} />}
      tabs={!isEditMode && <TransformTabs transform={transform} />}
      actions={actions}
      data-testid="transforms-header"
      breadcrumbs={
        <DataStudioBreadcrumbs>
          <Link to={Urls.transformList()}>{t`Transforms`}</Link>
          {transform.name}
        </DataStudioBreadcrumbs>
      }
      {...restProps}
    />
  );
}
