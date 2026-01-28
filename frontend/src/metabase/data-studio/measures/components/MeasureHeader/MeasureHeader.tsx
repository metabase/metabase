import type { ReactNode } from "react";
import { t } from "ttag";

import { useUpdateMeasureMutation } from "metabase/api";
import { EntityDetailTabs } from "metabase/data-studio/common/components/EntityDetailTabs/EntityDetailTabs";
import {
  PaneHeader,
  PaneHeaderInput,
} from "metabase/data-studio/common/components/PaneHeader";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Stack } from "metabase/ui";
import type { Measure } from "metabase-types/api";

import type { MeasureTabUrls } from "../../types";
import { MeasureMoreMenu } from "../MeasureMoreMenu";

const MEASURE_NAME_MAX_LENGTH = 254;

type MeasureHeaderProps = {
  measure: Measure;
  tabUrls: MeasureTabUrls;
  previewUrl?: string;
  onRemove?: () => void;
  onNameChange?: (name: string) => void;
  breadcrumbs?: ReactNode;
  actions?: ReactNode;
  readOnly?: boolean;
};

export function MeasureHeader({
  measure,
  tabUrls,
  previewUrl,
  onRemove,
  onNameChange,
  breadcrumbs,
  actions,
  readOnly,
}: MeasureHeaderProps) {
  return (
    <Stack gap={0}>
      <PaneHeader
        data-testid="measure-pane-header"
        title={
          <MeasureNameInput
            measure={measure}
            onNameChange={onNameChange}
            readOnly={readOnly}
          />
        }
        icon="sum"
        menu={
          <MeasureMoreMenu
            previewUrl={previewUrl}
            onRemove={readOnly ? undefined : onRemove}
          />
        }
        tabs={<EntityDetailTabs urls={tabUrls} />}
        actions={actions}
        breadcrumbs={breadcrumbs}
      />
    </Stack>
  );
}

type MeasureNameInputProps = {
  measure: Measure;
  onNameChange?: (name: string) => void;
  readOnly?: boolean;
};

function MeasureNameInput({
  measure,
  onNameChange,
  readOnly,
}: MeasureNameInputProps) {
  const [updateMeasure] = useUpdateMeasureMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleChange = async (newName: string) => {
    onNameChange?.(newName);

    if (newName === measure.name) {
      return;
    }

    const { error } = await updateMeasure({
      id: measure.id,
      name: newName,
      revision_message: t`Updated measure name`,
    });

    if (error) {
      sendErrorToast(t`Failed to update measure name`);
    } else {
      sendSuccessToast(t`Measure name updated`);
    }
  };

  return (
    <PaneHeaderInput
      initialValue={measure.name}
      placeholder={t`New measure`}
      maxLength={MEASURE_NAME_MAX_LENGTH}
      onChange={handleChange}
      onContentChange={onNameChange}
      readOnly={readOnly}
    />
  );
}
