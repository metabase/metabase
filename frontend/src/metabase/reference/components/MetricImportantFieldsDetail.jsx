import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import pure from "recompose/pure";
import { t } from "ttag";
import FieldsToGroupBy from "metabase/reference/components/FieldsToGroupBy";

import Select from "metabase/components/Select";

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
            placeholder={t`Select...`}
            multiple
            value={formField.value || []}
            onChange={formField.onChange}
            options={table.fields.map(fieldId => allFields[fieldId])}
            optionValueFn={field => field.id}
            optionNameFn={field => field.display_name || field.name}
            optionDisabledFn={field =>
              formField.value &&
              formField.value.length >= 3 &&
              !formField.value.includes(field.id)
            }
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
