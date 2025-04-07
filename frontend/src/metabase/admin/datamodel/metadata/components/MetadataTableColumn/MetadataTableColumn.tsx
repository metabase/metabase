import cx from "classnames";
import type { ReactNode } from "react";
import { useCallback } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import Fields from "metabase/entities/fields";
import { connect } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { SemanticTypeAndTargetPicker } from "metabase/metadata/components";
import { Button, Icon, Text } from "metabase/ui";
import { getThemeOverrides } from "metabase/ui/theme";
import type Field from "metabase-lib/v1/metadata/Field";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

import { FieldVisibilityPicker } from "../FieldVisibilityPicker";

import { ColumnContainer, ColumnInput } from "./MetadataTableColumn.styled";

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
        <div className={cx(CS.flex, CS.flexColumn)}>
          <div className={cx(CS.flex, CS.flexAuto)}>
            <div>
              <Label>{getFieldRawName(field)}</Label>
              <ColumnInput
                style={{ minWidth: 420 }}
                type="text"
                value={field.displayName()}
                onBlurChange={handleChangeName}
              />
            </div>
            <div className={cx(CS.pl1, CS.flexAuto)}>
              <LabelPlaceholder />
              <FieldVisibilityPicker
                className={CS.block}
                field={field}
                onUpdateField={onUpdateField}
              />
            </div>
            <div className={cx(CS.flexAuto, CS.px1)}>
              <Label>{field.getPlainObject().database_type}</Label>
              <SemanticTypeAndTargetPicker
                className={CS.block}
                field={field}
                idFields={idFields}
                onUpdateField={onUpdateField}
              />
            </div>
            <div>
              <LabelPlaceholder />
              <Button
                aria-label={t`Field settings`}
                component={Link}
                flex="0 0 auto"
                justify="center"
                mr="sm"
                p="10"
                to={Urls.dataModelField(
                  selectedDatabaseId,
                  selectedSchemaId,
                  selectedTableId,
                  Number(field.id),
                )}
                w="40"
              >
                <Icon name="gear" />
              </Button>
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

const Label = ({ children }: { children: ReactNode }) => {
  const { fontFamilyMonospace } = getThemeOverrides();

  return (
    <Text ff={fontFamilyMonospace} mb="xs" mih="1em" size="sm">
      {children}
    </Text>
  );
};

const LabelPlaceholder = () => <Label>&nbsp;</Label>;

export const getFieldRawName = (field: Field) => {
  return field.nfc_path ? field.nfc_path.join(".") : field.name;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(MetadataTableColumn);
