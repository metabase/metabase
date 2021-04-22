/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import { t } from "ttag";
import * as MetabaseCore from "metabase/lib/core";
import { isFK } from "metabase/lib/types";

import { getIn } from "icepick";

import S from "metabase/components/List.css";
import F from "./Field.css";

import Select from "metabase/components/Select";
import Icon from "metabase/components/Icon";

import cx from "classnames";
import pure from "recompose/pure";

const Field = ({ field, foreignKeys, url, icon, isEditing, formField }) => (
  <div className={cx(S.item, "pt1", "border-top")}>
    <div className={S.itemBody} style={{ maxWidth: "100%", borderTop: "none" }}>
      <div className={F.field}>
        <div className={cx(S.itemTitle, F.fieldName)}>
          {isEditing ? (
            <input
              className={F.fieldNameTextInput}
              type="text"
              placeholder={field.name}
              {...formField.display_name}
              defaultValue={field.display_name}
            />
          ) : (
            <div>
              <Link to={url}>
                <span className="text-brand">{field.display_name}</span>
                <span className={cx(F.fieldActualName, "ml2")}>
                  {field.name}
                </span>
              </Link>
            </div>
          )}
        </div>
        <div className={F.fieldType}>
          {isEditing ? (
            <Select
              placeholder={t`Select a field type`}
              value={formField.semantic_type.value || field.semantic_type}
              onChange={({ target: { value } }) =>
                formField.semantic_type.onChange(value)
              }
              options={MetabaseCore.field_semantic_types.concat({
                id: null,
                name: t`No field type`,
                section: t`Other`,
              })}
              optionValueFn={o => o.id}
              optionSectionFn={o => o.section}
            />
          ) : (
            <div className="flex">
              <div className={S.leftIcons}>
                {icon && <Icon className={S.chartIcon} name={icon} size={20} />}
              </div>
              <span
                className={
                  getIn(MetabaseCore.field_semantic_types_map, [
                    field.semantic_type,
                    "name",
                  ])
                    ? "text-medium"
                    : "text-light"
                }
              >
                {getIn(MetabaseCore.field_semantic_types_map, [
                  field.semantic_type,
                  "name",
                ]) || t`No field type`}
              </span>
            </div>
          )}
        </div>
        <div className={F.fieldDataType}>{field.base_type}</div>
      </div>
      <div className={cx(S.itemSubtitle, F.fieldSecondary, { mt1: true })}>
        <div className={F.fieldForeignKey}>
          {isEditing
            ? (isFK(formField.semantic_type.value) ||
                (isFK(field.semantic_type) &&
                  formField.semantic_type.value === undefined)) && (
                <Select
                  placeholder={t`Select a target`}
                  value={
                    formField.fk_target_field_id.value ||
                    field.fk_target_field_id
                  }
                  onChange={({ target: { value } }) =>
                    formField.fk_target_field_id.onChange(value)
                  }
                  options={Object.values(foreignKeys)}
                  optionValueFn={o => o.id}
                />
              )
            : isFK(field.semantic_type) && (
                <span>
                  {getIn(foreignKeys, [field.fk_target_field_id, "name"])}
                </span>
              )}
        </div>
        <div className={F.fieldOther} />
      </div>
      {field.description && (
        <div className={cx(S.itemSubtitle, "mb2", { mt1: isEditing })}>
          {field.description}
        </div>
      )}
    </div>
  </div>
);
Field.propTypes = {
  field: PropTypes.object.isRequired,
  foreignKeys: PropTypes.object.isRequired,
  url: PropTypes.string.isRequired,
  placeholder: PropTypes.string,
  icon: PropTypes.string,
  isEditing: PropTypes.bool,
  formField: PropTypes.object,
};

export default pure(Field);
