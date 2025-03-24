import cx from "classnames";
import { getIn } from "icepick";
import PropTypes from "prop-types";
import { memo } from "react";
import { t } from "ttag";

import { SemanticTypePicker } from "metabase/admin/datamodel/metadata/components/SemanticTypeAndTargetPicker";
import Select from "metabase/core/components/Select";
import CS from "metabase/css/core/index.css";
import { FIELD_SEMANTIC_TYPES_MAP } from "metabase/lib/core";
import D from "metabase/reference/components/Detail.module.css";
import { isTypeFK } from "metabase-lib/v1/types/utils/isa";

const FieldTypeDetail = ({
  field,
  foreignKeys,
  fieldTypeFormField,
  foreignKeyFormField,
  isEditing,
}) => (
  <div className={cx(D.detail)}>
    <div className={D.detailBody}>
      <div className={D.detailTitle}>
        <span>{t`Field type`}</span>
      </div>
      <div className={D.detailSubtitle}>
        <span>
          {isEditing ? (
            <SemanticTypePicker
              field={field}
              value={
                typeof fieldTypeFormField.value !== "undefined"
                  ? fieldTypeFormField.value
                  : field.semantic_type
              }
              onChange={value => {
                fieldTypeFormField.onChange({
                  target: {
                    name: fieldTypeFormField.name,
                    value,
                  },
                });
              }}
            />
          ) : (
            <span>
              {getIn(FIELD_SEMANTIC_TYPES_MAP, [field.semantic_type, "name"]) ||
                t`No field type`}
            </span>
          )}
        </span>
        <span className={CS.ml4}>
          {isEditing
            ? (isTypeFK(fieldTypeFormField.value) ||
                (isTypeFK(field.semantic_type) &&
                  fieldTypeFormField.value === undefined)) && (
                <Select
                  placeholder={t`Select a foreign key`}
                  value={foreignKeyFormField.value || field.fk_target_field_id}
                  options={Object.values(foreignKeys)}
                  onChange={({ target: { value } }) =>
                    foreignKeyFormField.onChange(value)
                  }
                  optionValueFn={o => o.id}
                />
              )
            : isTypeFK(field.semantic_type) && (
                <span>
                  {getIn(foreignKeys, [field.fk_target_field_id, "name"])}
                </span>
              )}
        </span>
      </div>
    </div>
  </div>
);

FieldTypeDetail.propTypes = {
  field: PropTypes.object.isRequired,
  foreignKeys: PropTypes.object.isRequired,
  fieldTypeFormField: PropTypes.object.isRequired,
  foreignKeyFormField: PropTypes.object.isRequired,
  isEditing: PropTypes.bool.isRequired,
};

export default memo(FieldTypeDetail);
