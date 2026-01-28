import type { ReactNode } from "react";
import { t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";

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
    <PaneHeader
      data-testid="measure-pane-header"
      title={
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
      }
      menu={previewUrl && <MeasureMoreMenu previewUrl={previewUrl} />}
      actions={actions}
      breadcrumbs={breadcrumbs}
    />
  );
}
