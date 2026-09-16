import type { ReactNode } from "react";
import { t } from "ttag";

import { PaneHeaderInput } from "metabase/common/data-studio/components/PaneHeader";
import { DataStudioPaneHeader } from "metabase/data-studio/app/components/DataStudioPaneHeader";

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
    <DataStudioPaneHeader
      data-testid="segment-pane-header"
      title={
        <PaneHeaderInput
          initialValue=""
          isOptional
          maxLength={SEGMENT_NAME_MAX_LENGTH}
          onContentChange={onNameChange}
          placeholder={t`New segment`}
        />
      }
      menu={previewUrl && <SegmentMoreMenu previewUrl={previewUrl} />}
      actions={actions}
      breadcrumbs={breadcrumbs}
    />
  );
}
