import cx from "classnames";
import { getIn } from "icepick";
import PropTypes from "prop-types";
import { memo } from "react";
import { t } from "ttag";

import { FIELD_SEMANTIC_TYPES_MAP } from "metabase/lib/core";
import {
  CurrencyPicker,
  SemanticTypePicker,
} from "metabase/metadata/components";
import { getFieldCurrency } from "metabase/metadata/utils/field";
import D from "metabase/reference/components/Detail.module.css";
import { Box } from "metabase/ui";
import { isTypeCurrency, isTypeFK } from "metabase-lib/v1/types/utils/isa";

import { FieldFkTargetPicker } from "./FieldFkTargetPicker";

const FieldTypeDetail = ({
  databaseId,
  field,
  fieldTypeFormField,
  foreignKeyFormField,
  fieldSettingsFormField,
  isEditing,
}) => {
  const semanticType =
    typeof fieldTypeFormField.value !== "undefined"
      ? fieldTypeFormField.value
      : field.semantic_type;
  const settings =
    typeof fieldSettingsFormField.value !== "undefined"
      ? fieldSettingsFormField.value
      : field.settings;
  const currency = getFieldCurrency(settings);

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
                comboboxProps={{
                  width: 300,
                }}
                field={field}
                fw="bold"
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
          {isEditing && isTypeCurrency(semanticType) && (
            <Box mt="sm">
              <CurrencyPicker
                value={currency}
                fw="bold"
                onChange={(currency) => {
                  fieldSettingsFormField.onChange({
                    target: {
                      name: fieldSettingsFormField.name,
                      value: { ...field.settings, currency },
                    },
                  });
                }}
              />
            </Box>
          )}
          {isEditing && isTypeFK(semanticType) && (
            <Box mt="sm">
              <FieldFkTargetPicker
                databaseId={databaseId}
                field={field}
                value={foreignKeyFormField.value || field.fk_target_field_id}
                /** bottom-start with flip: true opens down and shrinks height
                 * of popover to one line */
                comboboxProps={{ position: "top-start" }}
                onChange={(value) => {
                  foreignKeyFormField.onChange({
                    target: {
                      name: foreignKeyFormField.name,
                      value,
                    },
                  });
                }}
              />
            </Box>
          )}
        </div>
      </div>
    </div>
  );
};

FieldTypeDetail.propTypes = {
  databaseId: PropTypes.number.isRequired,
  field: PropTypes.object.isRequired,
  fieldTypeFormField: PropTypes.object.isRequired,
  foreignKeyFormField: PropTypes.object.isRequired,
  fieldSettingsFormField: PropTypes.object.isRequired,
  isEditing: PropTypes.bool.isRequired,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(FieldTypeDetail);
