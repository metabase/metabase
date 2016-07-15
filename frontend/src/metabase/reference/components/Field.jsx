/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { Link } from "react-router";

import * as MetabaseCore from "metabase/lib/core";
import { isNumeric } from "metabase/lib/schema_metadata";

import i from 'icepick';

import S from "metabase/components/List.css";
import F from "./Field.css";

import Icon from "metabase/components/Icon.jsx";
import Select from "metabase/components/Select.jsx";

import cx from "classnames";
import pure from "recompose/pure";

const Field = ({
    field,
    specialTypeId,
    url,
    icon,
    isEditing,
    formField
}) =>
    <div className={cx(S.item)}>
        <div className={S.leftIcons}>
        </div>
        <div className={S.itemBody}>
            <div className={F.field}>
                <div className={cx(S.itemTitle, F.fieldName)}>
                    { isEditing ?
                        <input
                            className={S.itemTitleTextInput}
                            type="text"
                            placeholder={field.display_name}
                            {...formField.display_name}
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
                                    .filter(type => !isNumeric(field) ?
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
                            value={MetabaseCore.field_special_types_map[field.special_type]}
                            options={
                                MetabaseCore.field_special_types
                                    .concat({
                                        'id': null,
                                        'name': 'No field type',
                                        'section': 'Other'
                                    })
                                    .filter(type => !isNumeric(field) ?
                                        !(type.id && type.id.startsWith("timestamp_")) :
                                        true
                                    )
                            }
                            updateImmediately={true}
                            onChange={(type) => formField.special_type.onChange(type.id)}
                        /> :
                        field.special_type === 'fk' &&
                        <span>
                            fk
                        </span>
                    }
                </div>
                <div className={F.fieldOther}>
                </div>
            </div>
        </div>
    </div>

Field.propTypes = {
    field: PropTypes.object.isRequired,
    url: PropTypes.string.isRequired,
    placeholder:        PropTypes.string,
    icon:               PropTypes.string,
    isEditing:          PropTypes.bool,
    formField:              PropTypes.object
};

export default pure(Field);
