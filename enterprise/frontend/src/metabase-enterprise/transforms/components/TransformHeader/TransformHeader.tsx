import type { Location } from "history";
import type { ReactNode } from "react";
import { t } from "ttag";

import {
  PaneHeader,
  PaneHeaderInput,
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase/data-studio/components/PaneHeader";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { getLocation } from "metabase/selectors/routing";
import { useUpdateTransformMutation } from "metabase-enterprise/api";
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
    <PaneHeader
      title={<TransformNameInput transform={transform} />}
      menu={hasMenu && <TransformMoreMenu transform={transform} />}
      tabs={<TransformTabs transform={transform} />}
      actions={actions}
      data-testid="transforms-header"
    />
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
  const location = useSelector(getLocation);
  const tabs = getTabs(transform.id, location);
  return <PaneHeaderTabs tabs={tabs} />;
}

function getTabs(id: TransformId, { pathname }: Location): PaneHeaderTab[] {
  return [
    {
      label: t`Query`,
      to: Urls.transform(id),
      isSelected: Urls.transform(id) === pathname,
    },
    {
      label: t`Run`,
      to: Urls.transformRun(id),
      isSelected: Urls.transformRun(id) === pathname,
    },
    {
      label: t`Target`,
      to: Urls.transformTarget(id),
      isSelected: Urls.transformTarget(id) === pathname,
    },
    ...(PLUGIN_DEPENDENCIES.isEnabled
      ? [
          {
            label: t`Dependencies`,
            to: Urls.transformDependencies(id),
            isSelected: Urls.transformDependencies(id) === pathname,
          },
        ]
      : []),
  ];
}
