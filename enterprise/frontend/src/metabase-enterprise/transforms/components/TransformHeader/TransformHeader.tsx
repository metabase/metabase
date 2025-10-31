import type { Location } from "history";
import type { ReactNode } from "react";
import { t } from "ttag";

import {
  BenchHeader,
  BenchHeaderInput,
  type BenchHeaderTab,
  BenchHeaderTabs,
} from "metabase/bench/components/BenchHeader";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { getLocation } from "metabase/selectors/routing";
import { useUpdateTransformMutation } from "metabase-enterprise/api";
import type { Transform, TransformId } from "metabase-types/api";

import { NAME_MAX_LENGTH } from "../../constants";

type TransformHeaderProps = {
  id?: TransformId;
  name: string;
  actions?: ReactNode;
  onChangeName: (name: string) => void;
};

export function TransformHeader({
  id,
  name,
  actions,
  onChangeName,
}: TransformHeaderProps) {
  return (
    <BenchHeader
      title={
        <BenchHeaderInput
          initialValue={name}
          maxLength={NAME_MAX_LENGTH}
          onChange={onChangeName}
        />
      }
      tabs={id != null && <TransformTabs id={id} />}
      actions={actions}
    />
  );
}

type TransformTabsProps = {
  id: TransformId;
};

function TransformTabs({ id }: TransformTabsProps) {
  const location = useSelector(getLocation);
  const tabs = getTabs(id, location);
  return <BenchHeaderTabs tabs={tabs} />;
}

function getTabs(id: TransformId, { pathname }: Location): BenchHeaderTab[] {
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

type TransformHeaderWithActionsProps = {
  transform: Transform;
};

export function TransformHeaderWithActions({
  transform,
}: TransformHeaderWithActionsProps) {
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
    <TransformHeader
      id={transform.id}
      name={transform.name}
      onChangeName={handleChangeName}
    />
  );
}
