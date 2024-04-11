import cx from "classnames";
import { getIn } from "icepick";
import PropTypes from "prop-types";
import { memo } from "react";
import { t } from "ttag";

import Select from "metabase/core/components/Select";
import CS from "metabase/css/core/index.css";
import * as MetabaseCore from "metabase/lib/core";
import D from "metabase/reference/components/Detail.module.css";
import { isTypeFK, isNumericBaseType } from "metabase-lib/v1/types/utils/isa";

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
      <div className={cx(D.detailSubtitle, { [CS.mt1]: true })}>
        <span>
          {isEditing ? (
            <Select
              placeholder={t`Select a field type`}
              value={fieldTypeFormField.value || field.semantic_type}
              options={MetabaseCore.field_semantic_types
                .concat({
                  id: null,
                  name: t`No field type`,
                  section: t`Other`,
                })
                .filter(type =>
                  !isNumericBaseType(field)
                    ? !(type.id && type.id.startsWith("timestamp_"))
                    : true,
                )}
              optionValueFn={o => o.id}
              onChange={({ target: { value } }) =>
                fieldTypeFormField.onChange(value)
              }
            />
          ) : (
            <span>
              {getIn(MetabaseCore.field_semantic_types_map, [
                field.semantic_type,
                "name",
              ]) || t`No field type`}
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
