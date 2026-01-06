import type { ReactNode } from "react";
import { t } from "ttag";

import EditableText from "metabase/common/components/EditableText";
import { PaneHeader } from "metabase-enterprise/data-studio/common/components/PaneHeader";

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
    <PaneHeader
      data-testid="segment-pane-header"
      title={
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
      }
      menu={previewUrl && <SegmentMoreMenu previewUrl={previewUrl} />}
      actions={actions}
      breadcrumbs={breadcrumbs}
    />
  );
}
