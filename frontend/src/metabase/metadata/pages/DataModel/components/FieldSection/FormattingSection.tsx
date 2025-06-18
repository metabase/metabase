import { memo, useMemo } from "react";
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

const FormattingSectionBase = ({ field }: Props) => {
  const id = getRawTableFieldId(field);
  const [updateField] = useUpdateFieldMutation();
  const [sendToast] = useToast();
  const inheritedSettings = useMemo(() => getGlobalSettingsForColumn(), []);
  const denyList = useMemo(() => {
    return isCurrency(field)
      ? new Set(["column_title", "number_style"])
      : new Set(["column_title"]);
  }, [field]);

  return (
    <Stack gap="md">
      <Box>
        <SectionPill title={t`Formatting`} />
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

          sendToast({
            icon: "check",
            message: t`Field formatting for ${field.display_name} updated`,
          });
        }}
      />
    </Stack>
  );
};

export const FormattingSection = memo(FormattingSectionBase);
