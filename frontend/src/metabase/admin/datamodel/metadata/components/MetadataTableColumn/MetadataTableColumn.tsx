import { ChangeEvent, ReactNode, useCallback } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import { Link } from "react-router";
import * as Urls from "metabase/lib/urls";
import Fields from "metabase/entities/fields";
import Button from "metabase/core/components/Button/Button";
import { DatabaseId, SchemaId, TableId } from "metabase-types/api";
import Field from "metabase-lib/metadata/Field";
import FieldVisibilityPicker from "../FieldVisibilityPicker";
import SemanticTypeAndTargetPicker from "../SemanticTypeAndTargetPicker";
import { ColumnInput } from "./MetadataTableColumn.styled";

interface OwnProps {
  field: Field;
  idFields: Field[];
  selectedDatabaseId: DatabaseId;
  selectedSchemaId: SchemaId;
  selectedTableId: TableId;
  dragHandle?: ReactNode;
}

interface DispatchProps {
  onUpdateField: (field: Field, updates: Partial<Field>) => void;
}

type MetadataTableColumnProps = OwnProps & DispatchProps;

const mapDispatchToProps: DispatchProps = {
  onUpdateField: Fields.actions.updateField,
};

const MetadataTableColumn = ({
  field,
  idFields,
  selectedDatabaseId,
  selectedSchemaId,
  selectedTableId,
  dragHandle,
  onUpdateField,
}: MetadataTableColumnProps) => {
  const handleChangeName = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (event.target.value) {
        onUpdateField(field, { display_name: event.target.value });
      } else {
        event.target.value = field.displayName();
      }
    },
    [field, onUpdateField],
  );

  const handleChangeDescription = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (event.target.value) {
        onUpdateField(field, { description: event.target.value });
      } else {
        onUpdateField(field, { description: null });
      }
    },
    [field, onUpdateField],
  );

  return (
    <section
      className="py2 pl2 pr1 mt1 mb3 flex bordered rounded"
      aria-label={field.name}
      data-testid={`column-${field.name}`}
    >
      <div className="flex flex-column flex-auto">
        <div className="text-monospace mb1" style={{ fontSize: "12px" }}>
          {getFieldRawName(field)}
        </div>
        <div className="flex flex-column">
          <div>
            <ColumnInput
              style={{ minWidth: 420 }}
              className="float-left inline-block"
              type="text"
              value={field.displayName()}
              onBlurChange={handleChangeName}
            />
            <div className="clearfix">
              <div className="flex flex-auto">
                <div className="pl1 flex-auto">
                  <FieldVisibilityPicker
                    className="block"
                    field={field}
                    onUpdateField={onUpdateField}
                  />
                </div>
                <div className="flex-auto px1">
                  <SemanticTypeAndTargetPicker
                    className="block"
                    field={field}
                    idFields={idFields}
                    onUpdateField={onUpdateField}
                  />
                </div>
                <Link
                  to={Urls.dataModelField(
                    selectedDatabaseId,
                    selectedSchemaId,
                    selectedTableId,
                    Number(field.id),
                  )}
                  className="text-brand-hover mr1"
                  aria-label={t`Field settings`}
                >
                  <Button icon="gear" style={{ padding: 10 }} />
                </Link>
              </div>
            </div>
          </div>
          <div className="MetadataTable-title flex flex-column flex-full mt1 mr1">
            <ColumnInput
              className="TableEditor-field-description rounded"
              type="text"
              value={field.description ?? ""}
              onBlurChange={handleChangeDescription}
              placeholder={t`No column description yet`}
              fullWidth
            />
          </div>
        </div>
      </div>
      {dragHandle}
    </section>
  );
};

export const getFieldRawName = (field: Field) => {
  return field.nfc_path ? field.nfc_path.join(".") : field.name;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(MetadataTableColumn);
