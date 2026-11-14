import type { ReactNode } from "react";
import { t } from "ttag";

import {
  PaneHeader,
  PaneHeaderInput,
} from "metabase/common/data-studio/components/PaneHeader";

import { SegmentMoreMenu } from "../../../components/SegmentMoreMenu";

const SEGMENT_NAME_MAX_LENGTH = 254;

type NewSegmentHeaderProps = {
  breadcrumbs: ReactNode;
  previewUrl?: string;
  /** The name it starts with, e.g. a proposal's */
  initialName?: string;
  onNameChange: (name: string) => void;
  actions?: ReactNode;
};

export function NewSegmentHeader({
  breadcrumbs,
  previewUrl,
  initialName = "",
  onNameChange,
  actions,
}: NewSegmentHeaderProps) {
  return (
    <PaneHeader
      data-testid="segment-pane-header"
      title={
        <PaneHeaderInput
          initialValue={initialName}
          isOptional
          maxLength={SEGMENT_NAME_MAX_LENGTH}
          onContentChange={onNameChange}
          placeholder={t`New segment`}
          autoFocus
        />
      }
      menu={previewUrl && <SegmentMoreMenu previewUrl={previewUrl} />}
      actions={actions}
      breadcrumbs={breadcrumbs}
    />
  );
}
