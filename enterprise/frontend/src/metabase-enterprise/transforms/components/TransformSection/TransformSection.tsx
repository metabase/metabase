import { t } from "ttag";

import { NameDescriptionInput } from "metabase/metadata/components/NameDescriptionInput";
import type { TransformSectionProps } from "metabase/plugins";
import { Stack } from "metabase/ui";
import { useGetTransformQuery } from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

export function TransformSection({ transformId }: TransformSectionProps) {
  const { data: transform } = useGetTransformQuery(transformId);

  if (!transform) {
    return null;
  }

  return <TransformSettings transform={transform} />;
}

type TransformSettingsProps = {
  transform: Transform;
};

function TransformSettings({ transform }: TransformSettingsProps) {
  return (
    <Stack data-testid="transform-section" flex={1} gap={0} pb="xl">
      <Stack bg="accent-gray-light" gap="lg" pb={12} pt="xl" px="xl">
        <NameDescriptionInput
          name={transform.name}
          nameIcon="refresh_downstream"
          nameMaxLength={254}
          namePlaceholder={t`Give this transform a name`}
          description=""
          descriptionPlaceholder={t`Give this transform a description`}
          onNameChange={() => undefined}
          onDescriptionChange={() => undefined}
        />
      </Stack>
    </Stack>
  );
}
