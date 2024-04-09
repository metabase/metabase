import { useCallback, useMemo } from "react";
import { connect } from "react-redux";

import Fields from "metabase/entities/fields";
import ColumnSettings from "metabase/visualizations/components/ColumnSettings";
import { getGlobalSettingsForColumn } from "metabase/visualizations/lib/settings/column";
import type Field from "metabase-lib/v1/metadata/Field";
import type { FieldFormattingSettings as FieldSettings } from "metabase-types/api";

import MetadataSection from "../MetadataSection";

interface OwnProps {
  field: Field;
}

interface DispatchProps {
  onUpdateField: (field: Field, updates: Partial<Field>) => void;
}

type FieldFormattingSettingsProps = OwnProps & DispatchProps;

const mapDispatchToProps: DispatchProps = {
  onUpdateField: Fields.actions.updateField,
};

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
        onChange={handleChangeSettings}
        extraData={{ forAdminSettings: true }}
      />
    </MetadataSection>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(FieldFormattingSettings);
