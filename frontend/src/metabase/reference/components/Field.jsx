/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import { getIn } from "icepick";
import PropTypes from "prop-types";
import { memo } from "react";
import { Link } from "react-router";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import S from "metabase/components/List/List.module.css";
import CS from "metabase/css/core/index.css";
import { FIELD_SEMANTIC_TYPES_MAP } from "metabase/lib/core";
import { SemanticTypePicker } from "metabase/metadata/components";
import { Icon } from "metabase/ui";
import { isTypeFK } from "metabase-lib/v1/types/utils/isa";

import F from "./Field.module.css";
import { FieldFkTargetPicker } from "./FieldFkTargetPicker";

const Field = ({
  databaseId,
  field,
  foreignKeys,
  url,
  icon,
  isEditing,
  formField,
}) => {
  const semanticType =
    typeof formField.semantic_type.value !== "undefined"
      ? formField.semantic_type.value
      : field.semantic_type;

  return (
    <div className={cx(S.item, CS.py1, CS.borderTop)}>
      <div
        className={cx(S.itemBody, CS.flexColumn)}
        style={{ maxWidth: "100%", borderTop: "none" }}
      >
        <div className={F.field} style={{ flexGrow: "1" }}>
          <div className={cx(S.itemTitle, F.fieldName)}>
            {isEditing ? (
              <input
                className={F.fieldTextInput}
                type="text"
                placeholder={field.name}
                {...formField.display_name}
                defaultValue={field.display_name}
              />
            ) : (
              <div>
                <Link to={url}>
                  <span className={CS.textBrand}>{field.display_name}</span>
                  <span className={cx(F.fieldActualName, CS.ml2)}>
                    {field.name}
                  </span>
                </Link>
              </div>
            )}
          </div>
          <div className={F.fieldType}>
            {isEditing ? (
              <SemanticTypePicker
                field={field}
                value={semanticType}
                onChange={(value) => {
                  formField.semantic_type.onChange({
                    target: {
                      name: formField.semantic_type.name,
                      value,
                    },
                  });
                }}
              />
            ) : (
              <div className={cx(CS.flex, CS.alignCenter)}>
                <div className={S.leftIcons}>
                  {icon && (
                    <Icon className={S.chartIcon} name={icon} size={20} />
                  )}
                </div>
                <span
                  className={
                    getIn(FIELD_SEMANTIC_TYPES_MAP, [
                      field.semantic_type,
                      "name",
                    ])
                      ? CS.textMedium
                      : CS.textLight
                  }
                >
                  {getIn(FIELD_SEMANTIC_TYPES_MAP, [
                    field.semantic_type,
                    "name",
                  ]) || t`No field type`}
                </span>
              </div>
            )}
          </div>
          <div className={F.fieldDataType}>{field.database_type}</div>
        </div>
        <div className={S.itemSubtitle}>
          <div className={F.fieldForeignKey}>
            {isEditing
              ? isTypeFK(semanticType) && (
                  <FieldFkTargetPicker
                    className={CS.mt1}
                    databaseId={databaseId}
                    field={field}
                    value={
                      formField.fk_target_field_id.value ||
                      field.fk_target_field_id
                    }
                    onChange={(value) => {
                      formField.fk_target_field_id.onChange({
                        target: {
                          name: formField.fk_target_field_id.name,
                          value,
                        },
                      });
                    }}
                  />
                )
              : isTypeFK(field.semantic_type) && (
                  <span className={CS.mt1}>
                    {getIn(foreignKeys, [field.fk_target_field_id, "name"])}
                  </span>
                )}
          </div>

          {match({ description: field.description, isEditing })
            .with({ isEditing: true }, () => {
              return (
                <input
                  className={cx(F.fieldTextInput, CS.mb2, CS.mt1)}
                  type="text"
                  placeholder={t`No column description yet`}
                  {...formField.description}
                  defaultValue={field.description ?? ""}
                />
              );
            })
            .with({ description: P.not(P.nullish) }, () => (
              <div className={cx(F.fieldDescription, CS.mb2, CS.mt1)}>
                {field.description}
              </div>
            ))
            .otherwise(() => null)}
        </div>
      </div>
    </div>
  );
};

Field.propTypes = {
  databaseId: PropTypes.number.isRequired,
  field: PropTypes.object.isRequired,
  foreignKeys: PropTypes.object.isRequired,
  url: PropTypes.string.isRequired,
  placeholder: PropTypes.string,
  icon: PropTypes.string,
  isEditing: PropTypes.bool,
  formField: PropTypes.object,
};

export default memo(Field);
