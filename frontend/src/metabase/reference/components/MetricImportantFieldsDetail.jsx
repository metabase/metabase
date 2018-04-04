import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import pure from "recompose/pure";
import { t } from "c-3po";
import FieldsToGroupBy from "metabase/reference/components/FieldsToGroupBy.jsx";

import Select from "metabase/components/Select.jsx";

import D from "metabase/reference/components/Detail.css";

const MetricImportantFieldsDetail = ({
  fields,
  metric,
  table,
  allFields,
  isEditing,
  onChangeLocation,
  formField,
}) =>
  isEditing ? (
    <div className={cx(D.detail)}>
      <div className={D.detailBody}>
        <div className={D.detailTitle}>
          <span className={D.detailName}>
            {t`Which 2-3 fields do you usually group this metric by?`}
          </span>
        </div>
        <div className={cx(D.detailSubtitle, { mt1: true })}>
          <Select
            key="metricFieldsSelect"
            triggerClasses="input p1 block"
            options={table.fields.map(fieldId => allFields[fieldId])}
            optionNameFn={option => option.display_name || option.name}
            placeholder={t`Select...`}
            values={formField.value || []}
            disabledOptionIds={
              formField.value && formField.value.length === 3
                ? table.fields
                    .map(fieldId => allFields[fieldId])
                    .filter(field => !formField.value.includes(field))
                    .map(field => field.id)
                : []
            }
            onChange={field => {
              const importantFields = formField.value || [];
              return importantFields.includes(field)
                ? formField.onChange(
                    importantFields.filter(
                      importantField => importantField !== field,
                    ),
                  )
                : importantFields.length < 3 &&
                    formField.onChange(importantFields.concat(field));
            }}
          />
        </div>
      </div>
    </div>
  ) : fields ? (
    <FieldsToGroupBy
      fields={fields}
      databaseId={table.db_id}
      metric={metric}
      title={t`Most useful fields to group this metric by`}
      onChangeLocation={onChangeLocation}
    />
  ) : null;
MetricImportantFieldsDetail.propTypes = {
  fields: PropTypes.object,
  metric: PropTypes.object.isRequired,
  table: PropTypes.object.isRequired,
  isEditing: PropTypes.bool.isRequired,
  onChangeLocation: PropTypes.func.isRequired,
  formField: PropTypes.object.isRequired,
};

export default pure(MetricImportantFieldsDetail);
