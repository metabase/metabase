import React, { useCallback, useMemo } from "react";
import ColumnSettings from "metabase/visualizations/components/ColumnSettings";
import { getGlobalSettingsForColumn } from "metabase/visualizations/lib/settings/column";
import { FieldFormattingSettings as FieldSettings } from "metabase-types/api";
import Field from "metabase-lib/metadata/Field";
import MetadataSection from "../MetadataSection";

interface FieldFormattingSettingsProps {
  field: Field;
  onUpdateField: (field: Field, updates: Partial<Field>) => void;
}

const FieldFormattingSettings = ({
  field,
  onUpdateField,
}: FieldFormattingSettingsProps) => {
  const denyList = useMemo(() => {
    return field.isCurrency()
      ? new Set(["column_title", "number_style"])
      : new Set(["column_title"]);
  }, [field]);

  const inheritedSettings = useMemo(() => {
    return getGlobalSettingsForColumn(field);
  }, [field]);

  const handleChangeSettings = useCallback(
    (settings: FieldSettings) => {
      onUpdateField(field, { settings });
    },
    [field, onUpdateField],
  );

  return (
    <MetadataSection last>
      <ColumnSettings
        value={field.settings ?? {}}
        column={field}
        denylist={denyList}
        inheritedSettings={inheritedSettings}
        forcefullyShowHiddenSettings
        onChange={handleChangeSettings}
      />
    </MetadataSection>
  );
};

export default FieldFormattingSettings;
