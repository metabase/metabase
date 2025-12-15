import type { ReactNode } from "react";
import { t } from "ttag";

import EditableText from "metabase/common/components/EditableText";
import { Group, Stack } from "metabase/ui";

import { MeasureMoreMenu } from "../MeasureMoreMenu";

const MEASURE_NAME_MAX_LENGTH = 254;

type NewMeasureHeaderProps = {
  breadcrumbs: ReactNode;
  previewUrl?: string;
  onNameChange: (name: string) => void;
  actions?: ReactNode;
};

export function NewMeasureHeader({
  breadcrumbs,
  previewUrl,
  onNameChange,
  actions,
}: NewMeasureHeaderProps) {
  return (
    <Stack gap="sm">
      {breadcrumbs}
      <Group
        gap="xs"
        align="center"
        justify="space-between"
        w="100%"
        px="lg"
        mih={40}
      >
        <Group gap="xs" align="center">
          <EditableText
            initialValue=""
            placeholder={t`New measure`}
            maxLength={MEASURE_NAME_MAX_LENGTH}
            p={0}
            fw="bold"
            fz="h3"
            lh="h3"
            onContentChange={onNameChange}
          />
          {previewUrl && <MeasureMoreMenu previewUrl={previewUrl} />}
        </Group>
        {actions}
      </Group>
    </Stack>
  );
}
