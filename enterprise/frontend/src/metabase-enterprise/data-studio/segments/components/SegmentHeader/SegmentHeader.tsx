import type { ReactNode } from "react";
import { t } from "ttag";

import { useUpdateSegmentMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Stack } from "metabase/ui";
import { EntityDetailTabs } from "metabase-enterprise/data-studio/common/components/EntityDetailTabs/EntityDetailTabs";
import {
  PaneHeader,
  PaneHeaderInput,
} from "metabase-enterprise/data-studio/common/components/PaneHeader";
import type { SegmentTabUrls } from "metabase-enterprise/data-studio/segments/types";
import type { Segment } from "metabase-types/api";

import { SegmentMoreMenu } from "../SegmentMoreMenu";

const SEGMENT_NAME_MAX_LENGTH = 254;

type SegmentHeaderProps = {
  segment: Segment;
  tabUrls: SegmentTabUrls;
  previewUrl?: string;
  onRemove?: () => void;
  onNameChange?: (name: string) => void;
  readOnly?: boolean;
  breadcrumbs?: ReactNode;
  actions?: ReactNode;
};

export function SegmentHeader({
  segment,
  tabUrls,
  previewUrl,
  onRemove,
  onNameChange,
  readOnly = false,
  breadcrumbs,
  actions,
}: SegmentHeaderProps) {
  return (
    <Stack gap={0}>
      <PaneHeader
        data-testid="segment-pane-header"
        title={
          <SegmentNameInput
            segment={segment}
            onNameChange={onNameChange}
            readOnly={readOnly}
          />
        }
        icon="segment"
        menu={<SegmentMoreMenu previewUrl={previewUrl} onRemove={onRemove} />}
        tabs={<EntityDetailTabs urls={tabUrls} />}
        actions={actions}
        breadcrumbs={breadcrumbs}
      />
    </Stack>
  );
}

type SegmentNameInputProps = {
  segment: Segment;
  onNameChange?: (name: string) => void;
  readOnly?: boolean;
};

function SegmentNameInput({
  segment,
  onNameChange,
  readOnly = false,
}: SegmentNameInputProps) {
  const [updateSegment] = useUpdateSegmentMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleChange = async (newName: string) => {
    if (readOnly) {
      return;
    }

    onNameChange?.(newName);

    if (newName === segment.name) {
      return;
    }

    const { error } = await updateSegment({
      id: segment.id,
      name: newName,
      revision_message: t`Updated segment name`,
    });

    if (error) {
      sendErrorToast(t`Failed to update segment name`);
    } else {
      sendSuccessToast(t`Segment name updated`);
    }
  };

  return (
    <PaneHeaderInput
      initialValue={segment.name}
      placeholder={t`New segment`}
      maxLength={SEGMENT_NAME_MAX_LENGTH}
      onChange={handleChange}
      onContentChange={onNameChange}
      readOnly={readOnly}
    />
  );
}
