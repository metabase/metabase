import cx from "classnames";
import type { ReactNode } from "react";
import { useCallback } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import Button from "metabase/core/components/Button/Button";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import Fields from "metabase/entities/fields";
import * as Urls from "metabase/lib/urls";
import type Field from "metabase-lib/v1/metadata/Field";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

import FieldVisibilityPicker from "../FieldVisibilityPicker";
import SemanticTypeAndTargetPicker from "../SemanticTypeAndTargetPicker";

import {
  ColumnContainer,
  ColumnInput,
  FieldSettingsLink,
} from "./MetadataTableColumn.styled";

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
    (event: { target: HTMLInputElement }) => {
      if (event.target.value) {
        onUpdateField(field, { display_name: event.target.value });
      } else {
        event.target.value = field.displayName();
      }
    },
    [field, onUpdateField],
  );

  const handleChangeDescription = useCallback(
    (event: { target: HTMLInputElement }) => {
      if (event.target.value) {
        onUpdateField(field, { description: event.target.value });
      } else {
        onUpdateField(field, { description: null });
      }
    },
    [field, onUpdateField],
  );

  return (
    <ColumnContainer
      aria-label={field.name}
      data-testid={`column-${field.name}`}
    >
      <div className={cx(CS.flex, CS.flexColumn, CS.flexAuto)}>
        <div
          className={cx(CS.textMonospace, CS.mb1)}
          style={{ fontSize: "12px" }}
        >
          {getFieldRawName(field)}
        </div>
        <div className={cx(CS.flex, CS.flexColumn)}>
          <div>
            <ColumnInput
              style={{ minWidth: 420 }}
              className={cx(CS.floatLeft, CS.inlineBlock)}
              type="text"
              value={field.displayName()}
              onBlurChange={handleChangeName}
            />
            <div className={CS.clearfix}>
              <div className={cx(CS.flex, CS.flexAuto)}>
                <div className={cx(CS.pl1, CS.flexAuto)}>
                  <FieldVisibilityPicker
                    className={CS.block}
                    field={field}
                    onUpdateField={onUpdateField}
                  />
                </div>
                <div className={cx(CS.flexAuto, CS.px1)}>
                  <SemanticTypeAndTargetPicker
                    className={CS.block}
                    field={field}
                    idFields={idFields}
                    onUpdateField={onUpdateField}
                  />
                </div>
                <FieldSettingsLink
                  to={Urls.dataModelField(
                    selectedDatabaseId,
                    selectedSchemaId,
                    selectedTableId,
                    Number(field.id),
                  )}
                  aria-label={t`Field settings`}
                >
                  <Button icon="gear" style={{ padding: 10 }} />
                </FieldSettingsLink>
              </div>
            </div>
          </div>
          <div
            className={cx(
              CS.bgWhite,
              CS.flex,
              CS.flexColumn,
              CS.flexFull,
              CS.mt1,
              CS.mr1,
            )}
          >
            <ColumnInput
              className={cx(AdminS.TableEditorFieldDescription, CS.rounded)}
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
    </ColumnContainer>
  );
};

export const getFieldRawName = (field: Field) => {
  return field.nfc_path ? field.nfc_path.join(".") : field.name;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(MetadataTableColumn);
