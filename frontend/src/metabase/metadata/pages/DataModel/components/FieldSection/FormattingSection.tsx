import { useMemo } from "react";
import { t } from "ttag";

import { useUpdateFieldMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Box, Stack } from "metabase/ui";
import ColumnSettings from "metabase/visualizations/components/ColumnSettings";
import { getGlobalSettingsForColumn } from "metabase/visualizations/lib/settings/column";
import { isCurrency } from "metabase-lib/v1/types/utils/isa";
import type {
  Field,
  FieldFormattingSettings as FieldSettings,
} from "metabase-types/api";

import { SectionPill } from "../SectionPill";

interface Props {
  field: Field;
}

export const FormattingSection = ({ field }: Props) => {
  const [updateField] = useUpdateFieldMutation();
  const id = getRawTableFieldId(field);
  const denyList = useMemo(() => {
    return isCurrency(field)
      ? new Set(["column_title", "number_style"])
      : new Set(["column_title"]);
  }, [field]);
  const inheritedSettings = useMemo(() => getGlobalSettingsForColumn(), []);
  const [sendToast] = useToast();
  function confirm(message: string) {
    sendToast({ message, icon: "check" });
  }

  return (
    <Stack gap="md">
      <Box>
        <SectionPill icon="variable" title={t`Formatting`} />
      </Box>

      <ColumnSettings
        column={field}
        denylist={denyList}
        extraData={{ forAdminSettings: true }}
        inheritedSettings={inheritedSettings}
        style={{ maxWidth: undefined }}
        value={field.settings ?? {}}
        onChange={async (settings: FieldSettings) => {
          await updateField({ id, settings });
          confirm(t`Field formatting for ${field.display_name} updated`);
        }}
      />
    </Stack>
  );
};
