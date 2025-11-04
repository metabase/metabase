import type { Location } from "history";
import type { ReactNode } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { getLocation } from "metabase/selectors/routing";
import { useUpdateTransformMutation } from "metabase-enterprise/api";
import type { TransformId } from "metabase-types/api";

import {
  PaneHeader,
  PaneHeaderInput,
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "../../../../../../../frontend/src/metabase/data-studio/components/PaneHeader";
import { NAME_MAX_LENGTH } from "../../constants";
import { TransformMoreMenuWithModal } from "../TransformMoreMenu";

type TransformHeaderProps = {
  id?: TransformId;
  name: string;
  actions?: ReactNode;
  hasMenu?: boolean;
  onChangeName?: (name: string) => void;
};

export function TransformHeader({
  id,
  name,
  actions,
  hasMenu = true,
  onChangeName,
}: TransformHeaderProps) {
  return (
    <PaneHeader
      title={
        <TransformNameInput id={id} name={name} onChangeName={onChangeName} />
      }
      menu={
        id != null && hasMenu && <TransformMoreMenuWithModal transformId={id} />
      }
      tabs={id != null && <TransformTabs id={id} />}
      actions={actions}
      data-testid="transforms-header"
    />
  );
}

type TransformNameInputProps = {
  id: TransformId | undefined;
  name: string;
  onChangeName?: (name: string) => void;
};

function TransformNameInput({
  id,
  name,
  onChangeName,
}: TransformNameInputProps) {
  const [updateTransform] = useUpdateTransformMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleChangeName = async (newName: string) => {
    onChangeName?.(newName);

    if (id == null) {
      return;
    }

    const { error } = await updateTransform({
      id,
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
      initialValue={name}
      maxLength={NAME_MAX_LENGTH}
      onChange={handleChangeName}
    />
  );
}

type TransformTabsProps = {
  id: TransformId;
};

function TransformTabs({ id }: TransformTabsProps) {
  const location = useSelector(getLocation);
  const tabs = getTabs(id, location);
  return <PaneHeaderTabs tabs={tabs} />;
}

function getTabs(id: TransformId, { pathname }: Location): PaneHeaderTab[] {
  return [
    {
      label: t`Query`,
      to: Urls.transform(id),
      icon: "sql",
      isSelected: Urls.transform(id) === pathname,
    },
    {
      label: t`Run`,
      to: Urls.transformRun(id),
      icon: "play_outlined",
      isSelected: Urls.transformRun(id) === pathname,
    },
    {
      label: t`Target`,
      to: Urls.transformTarget(id),
      icon: "table2",
      isSelected: Urls.transformTarget(id) === pathname,
    },
    ...(PLUGIN_DEPENDENCIES.isEnabled
      ? [
          {
            label: t`Dependencies`,
            to: Urls.transformDependencies(id),
            icon: "schema" as const,
            isSelected: Urls.transformDependencies(id) === pathname,
          },
        ]
      : []),
  ];
}
