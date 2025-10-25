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
import type { TransformInfo } from "../../types";

type TransformHeaderProps = {
  transform: Transform;
};

export function TransformHeader({ transform }: TransformHeaderProps) {
  const [updateTransform] = useUpdateTransformMutation();
  const { sendSuccessToast, sendErrorToast, sendUndoToast } =
    useMetadataToasts();

  const handleNameChange = async (newName: string) => {
    const { error } = await updateTransform({
      id: transform.id,
      name: newName,
    });

    if (error) {
      sendErrorToast(t`Failed to update transform name`);
    } else {
      sendSuccessToast(t`Transform name updated`, async () => {
        const { error } = await updateTransform({
          id: transform.id,
          name: transform.name,
        });
        sendUndoToast(error);
      });
    }
  };

  return (
    <TransformHeaderView
      transform={transform}
      onNameChange={handleNameChange}
    />
  );
}

type TransformHeaderViewProps = {
  transform: TransformInfo;
  actions?: ReactNode;
  onNameChange: (name: string) => void;
};

export function TransformHeaderView({
  transform,
  actions,
  onNameChange,
}: TransformHeaderViewProps) {
  return (
    <BenchPaneHeader
      title={
        <Stack>
          <BenchNameInput
            initialValue={transform.name}
            maxLength={NAME_MAX_LENGTH}
            onChange={onNameChange}
          />
          {transform.id != null && <TransformTabs transformId={transform.id} />}
        </Stack>
      }
      actions={actions}
      withBorder
    />
  );
}

type TransformTabsProps = {
  transformId: TransformId;
};

function TransformTabs({ transformId }: TransformTabsProps) {
  return (
    <BenchTabs
      tabs={[
        {
          label: t`Query`,
          to: Urls.transform(transformId),
          icon: "sql",
        },
        {
          label: t`Run`,
          to: Urls.transformRun(transformId),
          icon: "play_outlined",
        },
        {
          label: t`Target`,
          to: Urls.transformTarget(transformId),
          icon: "table2",
        },
        ...(PLUGIN_DEPENDENCIES.isEnabled
          ? [
              {
                label: t`Dependencies`,
                to: Urls.transformDependencies(transformId),
                icon: "network" as const,
              },
            ]
          : []),
      ]}
    />
  );
}
