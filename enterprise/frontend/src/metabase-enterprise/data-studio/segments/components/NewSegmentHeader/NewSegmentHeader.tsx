import type { ReactNode } from "react";
import { t } from "ttag";

import EditableText from "metabase/common/components/EditableText";
import { Group, Stack } from "metabase/ui";

import { SegmentMoreMenu } from "../SegmentMoreMenu";

const SEGMENT_NAME_MAX_LENGTH = 254;

type NewSegmentHeaderProps = {
  breadcrumbs: ReactNode;
  previewUrl?: string;
  onNameChange: (name: string) => void;
  actions?: ReactNode;
};

export function NewSegmentHeader({
  breadcrumbs,
  previewUrl,
  onNameChange,
  actions,
}: NewSegmentHeaderProps) {
  return (
    <Stack gap="sm">
      {breadcrumbs}
      <Group gap="xs" align="center" justify="space-between" w="100%" px="lg">
        <Group gap="xs" align="center">
          <EditableText
            initialValue=""
            placeholder={t`New segment`}
            maxLength={SEGMENT_NAME_MAX_LENGTH}
            p={0}
            fw="bold"
            fz="h3"
            lh="h3"
            onContentChange={onNameChange}
          />
          {previewUrl && <SegmentMoreMenu previewUrl={previewUrl} />}
        </Group>
        {actions}
      </Group>
    </Stack>
  );
}
