import { memo, useMemo } from "react";
import { t } from "ttag";

import { useUpdateFieldMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { ColumnSettings } from "metabase/visualizations/components/ColumnSettings";
import { getGlobalSettingsForColumn } from "metabase/visualizations/lib/settings/column";
import { isCurrency } from "metabase-lib/v1/types/utils/isa";
import type { MetadataEditEventDetail } from "metabase-types/analytics";
import type {
  Field,
  FieldFormattingSettings as FieldSettings,
} from "metabase-types/api";

import { TitledSection } from "../../TitledSection";

interface Props {
  field: Field;
  onTrackMetadataChange: (detail: MetadataEditEventDetail) => void;
}

const FormattingSectionBase = ({ field, onTrackMetadataChange }: Props) => {
  const id = getRawTableFieldId(field);
  const [updateField] = useUpdateFieldMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();
  const inheritedSettings = useMemo(() => getGlobalSettingsForColumn(), []);
  const denyList = useMemo(() => {
    return isCurrency(field)
      ? new Set(["column_title", "number_style"])
      : new Set(["column_title"]);
  }, [field]);

  const handleChange = async (settings: FieldSettings) => {
    const { error } = await updateField({ id, settings });

    if (error) {
      sendErrorToast(t`Failed to update formatting of ${field.display_name}`);
    } else {
      onTrackMetadataChange("formatting");

      sendSuccessToast(
        t`Formatting of ${field.display_name} updated`,
        async () => {
          const { error } = await updateField({
            id,
            settings: field.settings ?? {},
          });
          sendUndoToast(error);
        },
      );
    }
  };

  return (
    <TitledSection>
      <ColumnSettings
        column={field}
        denylist={denyList}
        extraData={{ forAdminSettings: true }}
        inheritedSettings={inheritedSettings}
        style={{ maxWidth: undefined }}
        value={field.settings ?? {}}
        onChange={handleChange}
      />
    </TitledSection>
  );
};

export const FormattingSection = memo(FormattingSectionBase);
