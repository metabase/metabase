import type { ReactNode } from "react";
import { t } from "ttag";

import {
  BenchHeader,
  BenchHeaderInput,
  type BenchHeaderTab,
  BenchHeaderTabs,
} from "metabase/bench/components/BenchHeader";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { useUpdateTransformMutation } from "metabase-enterprise/api";
import type { Transform, TransformId } from "metabase-types/api";

import { NAME_MAX_LENGTH } from "../../constants";

type TransformHeaderProps = {
  id?: TransformId;
  name: string;
  actions?: ReactNode;
  onNameChange: (name: string) => void;
};

export function TransformHeader({
  id,
  name,
  actions,
  onNameChange,
}: TransformHeaderProps) {
  return (
    <BenchHeader
      title={
        <BenchHeaderInput
          initialValue={name}
          maxLength={NAME_MAX_LENGTH}
          onChange={onNameChange}
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
  const tabs = getTabs(id);
  return <BenchHeaderTabs tabs={tabs} />;
}

function getTabs(id: TransformId): BenchHeaderTab[] {
  return [
    {
      label: t`Query`,
      to: Urls.transform(id),
      icon: "sql",
      isSelected: false,
    },
    {
      label: t`Run`,
      to: Urls.transformRun(id),
      icon: "play_outlined",
      isSelected: false,
    },
    {
      label: t`Target`,
      to: Urls.transformTarget(id),
      icon: "table2",
      isSelected: false,
    },
    ...(PLUGIN_DEPENDENCIES.isEnabled
      ? [
          {
            label: t`Dependencies`,
            to: Urls.transformDependencies(id),
            icon: "schema" as const,
            isSelected: false,
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

  const handleNameChange = async (newName: string) => {
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
      onNameChange={handleNameChange}
    />
  );
}
