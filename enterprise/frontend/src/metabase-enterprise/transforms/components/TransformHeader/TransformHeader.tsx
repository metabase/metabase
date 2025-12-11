import type { ReactNode } from "react";
import { t } from "ttag";

import Link from "metabase/common/components/Link/Link";
import * as Urls from "metabase/lib/urls";
import { Flex, Icon } from "metabase/ui";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase-enterprise/data-studio/common/components/PaneHeader";
import type { Transform } from "metabase-types/api";

import { TransformsSectionHeader } from "../TransformsSectionHeader";

import { TransformMoreMenu } from "./TransformMoreMenu";
import { TransformNameInput } from "./TransformNameInput";
import { TransformTabs } from "./TransformTabs";

type TransformHeaderProps = {
  actions?: ReactNode;
  hasMenu?: boolean;
  isEditMode?: boolean;
  transform: Transform;
};

export function TransformHeader({
  transform,
  actions,
  hasMenu = true,
  isEditMode = false,
}: TransformHeaderProps) {
  return (
    <>
      <TransformsSectionHeader
        leftSection={
          <DataStudioBreadcrumbs>
            <Link to={Urls.transformList()}>{t`Transforms`}</Link>
            {transform.name}
          </DataStudioBreadcrumbs>
        }
      />
      <PaneHeader
        px={0}
        title={
          <Flex align="center" gap="sm">
            <Icon name="transform" c="brand" />
            <TransformNameInput transform={transform} />
          </Flex>
        }
        menu={hasMenu && <TransformMoreMenu transform={transform} />}
        tabs={!isEditMode && <TransformTabs transform={transform} />}
        actions={actions}
        data-testid="transforms-header"
      />
    </>
  );
}
