import type { ReactNode } from "react";
import { t } from "ttag";

import Link from "metabase/common/components/Link/Link";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { useUpdateTransformMutation } from "metabase-enterprise/api";
import { TransformsSectionHeader } from "metabase-enterprise/data-studio/app/pages/TransformsSectionLayout/TransformsSectionHeader";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs/DataStudioBreadcrumbs";
import {
  PaneHeader,
  PaneHeaderInput,
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase-enterprise/data-studio/common/components/PaneHeader";
import type { Transform, TransformId } from "metabase-types/api";

import { NAME_MAX_LENGTH } from "../../constants";

import { TransformMoreMenu } from "./TransformMoreMenu";

type TransformHeaderProps = {
  transform: Transform;
  actions?: ReactNode;
  hasMenu?: boolean;
};

export function TransformHeader({
  transform,
  actions,
  hasMenu = true,
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
        title={<TransformNameInput transform={transform} />}
        menu={hasMenu && <TransformMoreMenu transform={transform} />}
        tabs={<TransformTabs transform={transform} />}
        actions={actions}
        data-testid="transforms-header"
      />
    </>
  );
}

type TransformNameInputProps = {
  transform: Transform;
};

function TransformNameInput({ transform }: TransformNameInputProps) {
  const [updateTransform] = useUpdateTransformMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleChangeName = async (newName: string) => {
    const { error } = await updateTransform({
      id: transform.id,
      name: newName,
    });

    if (error) {
      sendErrorToast(t`Failed to update transform name`);
    } else {
      sendSuccessToast(t`Transform name updated`);
    }
  };

  return (
    <PaneHeaderInput
      initialValue={transform.name}
      maxLength={NAME_MAX_LENGTH}
      onChange={handleChangeName}
    />
  );
}

type TransformTabsProps = {
  transform: Transform;
};

function TransformTabs({ transform }: TransformTabsProps) {
  const tabs = getTabs(transform.id);
  return <PaneHeaderTabs tabs={tabs} />;
}

function getTabs(id: TransformId): PaneHeaderTab[] {
  const tabs: PaneHeaderTab[] = [
    {
      label: t`Definition`,
      to: Urls.transform(id),
    },
    {
      label: t`Run`,
      to: Urls.transformRun(id),
    },
    {
      label: t`Target`,
      to: Urls.transformTarget(id),
    },
  ];

  if (PLUGIN_DEPENDENCIES.isEnabled) {
    tabs.push({
      label: t`Dependencies`,
      to: Urls.transformDependencies(id),
    });
  }

  return tabs;
}
