import type { ReactNode } from "react";
import { t } from "ttag";

import { BenchPaneHeader } from "metabase/bench/components/BenchPaneHeader";
import { BenchNameInput } from "metabase/bench/components/shared/BenchNameInput";
import { BenchTabs } from "metabase/bench/components/shared/BenchTabs";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Stack } from "metabase/ui";
import { useUpdateTransformMutation } from "metabase-enterprise/api";
import type { Transform, TransformId } from "metabase-types/api";

import { NAME_MAX_LENGTH } from "../../constants";

type TransformHeaderProps = {
  transform: Transform;
};

export function TransformHeader({ transform }: TransformHeaderProps) {
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
    <TransformHeaderView
      id={transform.id}
      name={transform.name}
      onNameChange={handleNameChange}
    />
  );
}

type TransformHeaderViewProps = {
  id?: TransformId;
  name: string;
  actions?: ReactNode;
  onNameChange: (name: string) => void;
};

export function TransformHeaderView({
  id,
  name,
  actions,
  onNameChange,
}: TransformHeaderViewProps) {
  return (
    <BenchPaneHeader
      title={
        <Stack>
          <BenchNameInput
            initialValue={name}
            maxLength={NAME_MAX_LENGTH}
            onChange={onNameChange}
          />
          {id != null && <TransformTabs id={id} />}
        </Stack>
      }
      actions={actions}
      withBorder
    />
  );
}

type TransformTabsProps = {
  id: TransformId;
};

function TransformTabs({ id }: TransformTabsProps) {
  return (
    <BenchTabs
      tabs={[
        {
          label: t`Query`,
          to: Urls.transform(id),
          icon: "sql",
        },
        {
          label: t`Run`,
          to: Urls.transformRun(id),
          icon: "play_outlined",
        },
        {
          label: t`Target`,
          to: Urls.transformTarget(id),
          icon: "table2",
        },
        ...(PLUGIN_DEPENDENCIES.isEnabled
          ? [
              {
                label: t`Dependencies`,
                to: Urls.transformDependencies(id),
                icon: "network" as const,
              },
            ]
          : []),
      ]}
    />
  );
}
