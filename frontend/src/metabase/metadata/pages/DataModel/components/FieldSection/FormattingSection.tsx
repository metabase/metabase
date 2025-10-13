import { memo, useMemo } from "react";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import type {
  FieldChangeParams,
  MetadataEditMode,
} from "metabase/metadata/pages/DataModel/types";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import ColumnSettings from "metabase/visualizations/components/ColumnSettings";
import { getGlobalSettingsForColumn } from "metabase/visualizations/lib/settings/column";
import { isCurrency } from "metabase-lib/v1/types/utils/isa";
import type {
  Field,
  FieldFormattingSettings as FieldSettings,
} from "metabase-types/api";

import { trackMetadataChange } from "../../analytics";
import { TitledSection } from "../TitledSection";

interface Props {
  mode: MetadataEditMode;
  field: Field;
  onFieldChange: (update: FieldChangeParams) => Promise<{ error?: string }>;
}

const FormattingSectionBase = ({ mode, field, onFieldChange }: Props) => {
  const fieldIdentity =
    mode === "table" ? { id: getRawTableFieldId(field) } : { name: field.name };
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();
  const inheritedSettings = useMemo(() => getGlobalSettingsForColumn(), []);
  const denyList = useMemo(() => {
    return isCurrency(field)
      ? new Set(["column_title", "number_style"])
      : new Set(["column_title"]);
  }, [field]);

  const handleChange = async (settings: FieldSettings) => {
    const { error } = await onFieldChange({ ...fieldIdentity, settings });

    if (error) {
      sendErrorToast(t`Failed to update formatting of ${field.display_name}`);
    } else {
      trackMetadataChange("formatting");

      sendSuccessToast(
        t`Formatting of ${field.display_name} updated`,
        async () => {
          const { error } = await onFieldChange({
            ...fieldIdentity,
            settings: field.settings ?? {},
          });
          sendUndoToast(error);
        },
      );
    }
  };

  return (
    <TitledSection title={t`Formatting`}>
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
