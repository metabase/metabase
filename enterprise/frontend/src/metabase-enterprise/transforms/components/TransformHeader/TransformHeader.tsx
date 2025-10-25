import type { ReactNode } from "react";
import { t } from "ttag";

import { BenchPaneHeader } from "metabase/bench/components/BenchPaneHeader";
import { BenchTabs } from "metabase/bench/components/shared/BenchTabs";
import EditableText from "metabase/common/components/EditableText/EditableText";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Stack } from "metabase/ui";
import { useUpdateTransformMutation } from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

import { NAME_MAX_LENGTH } from "../../constants";

type TransformHeaderProps = {
  transform: Transform | undefined;
  actions?: ReactNode;
};

export function TransformHeader({ transform, actions }: TransformHeaderProps) {
  return (
    <BenchPaneHeader
      title={
        transform && (
          <Stack>
            <TransformNameInput transform={transform} />
            <TransformTabs transform={transform} />
          </Stack>
        )
      }
      actions={actions}
      withBorder
    />
  );
}

type TransformNameInputProps = {
  transform: Transform;
};

function TransformNameInput({ transform }: TransformNameInputProps) {
  const [updateTransform] = useUpdateTransformMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const onNameChange = async (newName: string) => {
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
    <EditableText
      initialValue={transform.name}
      maxLength={NAME_MAX_LENGTH}
      placeholder={t`Name`}
      p={0}
      fw="bold"
      fz="h3"
      lh="h3"
      onChange={onNameChange}
    />
  );
}

type TransformTabsProps = {
  transform: Transform;
};

function TransformTabs({ transform }: TransformTabsProps) {
  return (
    <BenchTabs
      tabs={[
        {
          label: t`Query`,
          to: Urls.transform(transform.id),
          icon: "sql",
        },
        {
          label: t`Run`,
          to: Urls.transformRun(transform.id),
          icon: "play_outlined",
        },
        {
          label: t`Target`,
          to: Urls.transformTarget(transform.id),
          icon: "table2",
        },
        ...(PLUGIN_DEPENDENCIES.isEnabled
          ? [
              {
                label: t`Dependencies`,
                to: Urls.transformDependencies(transform.id),
                icon: "network" as const,
              },
            ]
          : []),
      ]}
    />
  );
}
