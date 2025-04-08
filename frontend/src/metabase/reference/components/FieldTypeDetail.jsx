import cx from "classnames";
import { getIn } from "icepick";
import PropTypes from "prop-types";
import { memo } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { FIELD_SEMANTIC_TYPES_MAP } from "metabase/lib/core";
import { SemanticTypePicker } from "metabase/metadata/components";
import D from "metabase/reference/components/Detail.module.css";
import { isTypeFK } from "metabase-lib/v1/types/utils/isa";

import { FieldFkTargetPicker } from "./FieldFkTargetPicker";

const FieldTypeDetail = ({
  databaseId,
  field,
  foreignKeys,
  fieldTypeFormField,
  foreignKeyFormField,
  isEditing,
}) => {
  const semanticType =
    typeof fieldTypeFormField.value !== "undefined"
      ? fieldTypeFormField.value
      : field.semantic_type;

  return (
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
                value={semanticType}
                onChange={(value) => {
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
                {getIn(FIELD_SEMANTIC_TYPES_MAP, [
                  field.semantic_type,
                  "name",
                ]) || t`No field type`}
              </span>
            )}
          </span>
          <span className={CS.ml4}>
            {isEditing
              ? isTypeFK(semanticType) && (
                  <FieldFkTargetPicker
                    databaseId={databaseId}
                    field={field}
                    value={
                      foreignKeyFormField.value || field.fk_target_field_id
                    }
                    onChange={(value) => {
                      foreignKeyFormField.onChange({
                        target: {
                          name: foreignKeyFormField.name,
                          value,
                        },
                      });
                    }}
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
};

FieldTypeDetail.propTypes = {
  databaseId: PropTypes.number.isRequired,
  field: PropTypes.object.isRequired,
  foreignKeys: PropTypes.object.isRequired,
  fieldTypeFormField: PropTypes.object.isRequired,
  foreignKeyFormField: PropTypes.object.isRequired,
  isEditing: PropTypes.bool.isRequired,
};

export default memo(FieldTypeDetail);
