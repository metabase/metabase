/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { Link } from "react-router";

import * as MetabaseCore from "metabase/lib/core";
import { isNumericBaseType } from "metabase/lib/schema_metadata";

import i from 'icepick';

import S from "metabase/components/List.css";
import F from "./Field.css";

import Select from "metabase/components/Select.jsx";

import cx from "classnames";
import pure from "recompose/pure";

const Field = ({
    field,
    foreignKeys,
    url,
    icon,
    isEditing,
    formField
}) => {
    return <div className={cx(S.item)}>
        <div className={S.leftIcons}>
        </div>
        <div className={S.itemBody}>
            <div className={F.field}>
                <div className={cx(S.itemTitle, F.fieldName)}>
                    { isEditing ?
                        <input
                            className={S.itemTitleTextInput}
                            type="text"
                            placeholder={field.name}
                            {...formField.display_name}
                            defaultValue={field.display_name}
                        /> :
                        <Link to={url} className={S.itemName}>{field.display_name}</Link>
                    }
                </div>
                <div className={F.fieldType}>
                    { isEditing ?
                        <Select
                            placeholder="Select a field type"
                            value={MetabaseCore.field_special_types_map[field.special_type]}
                            options={
                                MetabaseCore.field_special_types
                                    .concat({
                                        'id': null,
                                        'name': 'No field type',
                                        'section': 'Other'
                                    })
                                    .filter(type => !isNumericBaseType(field) ?
                                        !(type.id && type.id.startsWith("timestamp_")) :
                                        true
                                    )
                            }
                            updateImmediately={true}
                            onChange={(type) => formField.special_type.onChange(type.id)}
                        /> :
                        <span>
                            { i.getIn(
                                    MetabaseCore.field_special_types_map,
                                    [field.special_type, 'name']
                                ) || 'No field type'
                            }
                        </span>
                    }
                </div>
                <div className={F.fieldDataType}>
                    {field.base_type}
                </div>
            </div>
            <div className={cx(S.itemSubtitle, F.fieldSecondary, { "mt1" : true })}>
                <div className={F.fieldActualName}>
                    { field.name }
                </div>
                <div className={F.fieldForeignKey}>
                    { isEditing ?
                        (formField.special_type.value === 'fk' ||
                        (field.special_type === 'fk' && formField.special_type.value === undefined)) &&
                        <Select
                            placeholder="Select a field type"
                            value={foreignKeys[field.fk_target_field_id] || {}}
                            options={Object.values(foreignKeys)}
                            updateImmediately={true}
                            onChange={(foreignKey) => formField.fk_target_field_id.onChange(foreignKey.id)}
                            optionNameFn={(foreignKey) => foreignKey.name}
                        /> :
                        field.special_type === 'fk' &&
                        <span>
                            {i.getIn(foreignKeys, [field.fk_target_field_id, "name"])}
                        </span>
                    }
                </div>
                <div className={F.fieldOther}>
                </div>
            </div>
        </div>
    </div>
}
Field.propTypes = {
    field: PropTypes.object.isRequired,
    foreignKeys: PropTypes.object.isRequired,
    url: PropTypes.string.isRequired,
    placeholder: PropTypes.string,
    icon: PropTypes.string,
    isEditing: PropTypes.bool,
    formField: PropTypes.object
};

export default pure(Field);
