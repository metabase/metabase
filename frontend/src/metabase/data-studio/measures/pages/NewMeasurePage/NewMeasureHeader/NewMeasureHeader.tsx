import type { ReactNode } from "react";
import { t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";

import { MeasureMoreMenu } from "../../../components/MeasureMoreMenu";

const MEASURE_NAME_MAX_LENGTH = 254;

type NewMeasureHeaderProps = {
  breadcrumbs: ReactNode;
  previewUrl?: string;
  /** The name it starts with, e.g. a proposal's */
  initialName?: string;
  onNameChange: (name: string) => void;
  actions?: ReactNode;
};

export function NewMeasureHeader({
  breadcrumbs,
  previewUrl,
  initialName = "",
  onNameChange,
  actions,
}: NewMeasureHeaderProps) {
  return (
    <PaneHeader
      data-testid="measure-pane-header"
      title={
        <EditableText
          initialValue={initialName}
          placeholder={t`New measure`}
          maxLength={MEASURE_NAME_MAX_LENGTH}
          p={0}
          fw="bold"
          fz="h3"
          lh="h3"
          onContentChange={onNameChange}
          autoFocus
        />
      }
      menu={previewUrl && <MeasureMoreMenu previewUrl={previewUrl} />}
      actions={actions}
      breadcrumbs={breadcrumbs}
    />
  );
}
