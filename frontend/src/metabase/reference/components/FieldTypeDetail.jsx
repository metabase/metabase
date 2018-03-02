import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { getIn } from "icepick";
import pure from "recompose/pure";
import { t } from "c-3po";
import * as MetabaseCore from "metabase/lib/core";
import { isNumericBaseType } from "metabase/lib/schema_metadata";
import { isFK } from "metabase/lib/types";

import Select from "metabase/components/Select.jsx";

import D from "metabase/reference/components/Detail.css";

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
        <span className={D.detailName}>{t`Field type`}</span>
      </div>
      <div className={cx(D.detailSubtitle, { mt1: true })}>
        <span>
          {isEditing ? (
            <Select
              triggerClasses="rounded bordered p1 inline-block"
              placeholder={t`Select a field type`}
              value={
                MetabaseCore.field_special_types_map[
                  fieldTypeFormField.value
                ] || MetabaseCore.field_special_types_map[field.special_type]
              }
              options={MetabaseCore.field_special_types
                .concat({
                  id: null,
                  name: t`No field type`,
                  section: t`Other`,
                })
                .filter(
                  type =>
                    !isNumericBaseType(field)
                      ? !(type.id && type.id.startsWith("timestamp_"))
                      : true,
                )}
              onChange={type => fieldTypeFormField.onChange(type.id)}
            />
          ) : (
            <span>
              {getIn(MetabaseCore.field_special_types_map, [
                field.special_type,
                "name",
              ]) || t`No field type`}
            </span>
          )}
        </span>
        <span className="ml4">
          {isEditing
            ? (isFK(fieldTypeFormField.value) ||
                (isFK(field.special_type) &&
                  fieldTypeFormField.value === undefined)) && (
                <Select
                  triggerClasses="rounded bordered p1 inline-block"
                  placeholder={t`Select a field type`}
                  value={
                    foreignKeys[foreignKeyFormField.value] ||
                    foreignKeys[field.fk_target_field_id] || {
                      name: t`Select a Foreign Key`,
                    }
                  }
                  options={Object.values(foreignKeys)}
                  onChange={foreignKey =>
                    foreignKeyFormField.onChange(foreignKey.id)
                  }
                  optionNameFn={foreignKey => foreignKey.name}
                />
              )
            : isFK(field.special_type) && (
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

export default pure(FieldTypeDetail);
