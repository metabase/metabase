/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";
import { reduxForm } from "redux-form";
import i from "icepick";

import S from "metabase/components/List.css";
import R from "metabase/reference/Reference.css";
import F from "metabase/reference/components/Field.css"

import Field from "metabase/reference/components/Field.jsx";
import List from "metabase/components/List.jsx";
import Icon from "metabase/components/Icon.jsx";
import EmptyState from "metabase/components/EmptyState.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import cx from "classnames";

import {
    getSection,
    getData,
    getForeignKeys,
    getError,
    getLoading,
    getUser,
    getIsEditing,
} from "../selectors";

import * as metadataActions from "metabase/redux/metadata";
import * as actions from 'metabase/reference/reference';

const fieldsToFormFields = (fields) => Object.keys(fields)
    .map(key => [
        `${key}.display_name`,
        `${key}.special_type`,
        `${key}.fk_target_field_id`
    ])
    .reduce((array, keys) => array.concat(keys), []);

const mapStateToProps = (state, props) => {
    const data = getData(state);
    return {
        section: getSection(state),
        entities: data,
        foreignKeys: getForeignKeys(state),
        loading: getLoading(state),
        loadingError: getError(state),
        user: getUser(state),
        isEditing: getIsEditing(state),
        fields: fieldsToFormFields(data)
    };
}

const mapDispatchToProps = {
    ...metadataActions,
    ...actions
};

const validate = (values, props) => {
    return {};
}

@connect(mapStateToProps, mapDispatchToProps)
@reduxForm({
    form: 'fields',
    validate
})
export default class ReferenceEntityList extends Component {
    static propTypes = {
        style: PropTypes.object.isRequired,
        entities: PropTypes.object.isRequired,
        foreignKeys: PropTypes.object.isRequired,
        isEditing: PropTypes.bool,
        startEditing: PropTypes.func.isRequired,
        endEditing: PropTypes.func.isRequired,
        startLoading: PropTypes.func.isRequired,
        endLoading: PropTypes.func.isRequired,
        setError: PropTypes.func.isRequired,
        updateField: PropTypes.func.isRequired,
        handleSubmit: PropTypes.func.isRequired,
        user: PropTypes.object.isRequired,
        fields: PropTypes.object.isRequired,
        section: PropTypes.object.isRequired,
        loading: PropTypes.bool,
        loadingError: PropTypes.object,
        submitting: PropTypes.bool
    };

    render() {
        const {
            style,
            entities,
            fields,
            foreignKeys,
            section,
            loadingError,
            loading,
            user,
            isEditing,
            startEditing,
            endEditing,
            startLoading,
            endLoading,
            setError,
            updateField,
            handleSubmit,
            submitting
        } = this.props;

        return (
            <form style={style} className="full"
                onSubmit={handleSubmit(async formFields => {
                    const updatedFields = Object.keys(formFields)
                        .map(fieldId => ({
                            field: entities[fieldId],
                            formField: Object.keys(formFields[fieldId])
                                .filter(key => formFields[fieldId][key] !== undefined)
                                .reduce((map, key) => i
                                    .assoc(map, key, formFields[fieldId][key]), {}
                                )
                        }))
                        .filter(({field, formField}) => Object
                            .keys(formField).length !== 0
                        )
                        .map(({field, formField}) => ({...field, ...formField}));

                    startLoading();
                    try {
                        await Promise.all(updatedFields.map(updateField));
                    }
                    catch(error) {
                        setError(error);
                        console.error(error);
                    }
                    endLoading();
                    endEditing();
                })}
            >
                { isEditing &&
                    <div className={cx("EditHeader wrapper py1", R.subheader)}>
                        <div>
                            You are editing this page
                        </div>
                        <div className={R.subheaderButtons}>
                            <button
                                className={cx("Button", "Button--primary", "Button--white", "Button--small", R.saveButton)}
                                type="submit"
                                disabled={submitting}
                            >
                                SAVE
                            </button>
                            <button
                                type="button"
                                className={cx("Button", "Button--white", "Button--small", R.cancelButton)}
                                onClick={endEditing}
                            >
                                CANCEL
                            </button>
                        </div>
                    </div>
                }
                <div className="wrapper wrapper--trim">
                    <div className={S.header}>
                        <div className={S.leftIcons}>
                            { section.headerIcon &&
                                <Icon
                                    className="text-brand"
                                    name={section.headerIcon}
                                    width={24}
                                    height={24}
                                />
                            }
                        </div>
                        {section.name}
                        { user.is_superuser && !isEditing &&
                            <div className={S.headerButton}>
                                <a
                                    onClick={startEditing}
                                    className={cx("Button", "Button--borderless", R.editButton)}
                                >
                                    <div className="flex align-center relative">
                                        <Icon name="pencil" width="16px" height="16px" />
                                        <span className="ml1">Edit</span>
                                    </div>
                                </a>
                            </div>
                        }
                    </div>
                </div>
                <LoadingAndErrorWrapper loading={!loadingError && loading} error={loadingError}>
                { () => Object.keys(entities).length > 0 ?
                    <div className="wrapper wrapper--trim">
                        <div className={cx(S.item)}>
                            <div className={R.columnHeader}>
                                <div className={cx(S.itemTitle, F.fieldName)}>
                                    Field name
                                </div>
                                <div className={cx(S.itemTitle, F.fieldType)}>
                                    Field type
                                </div>
                                <div className={cx(S.itemTitle, F.fieldDataType)}>
                                    Data type
                                </div>
                            </div>
                        </div>
                        <List>
                            { Object.values(entities).map(entity =>
                                entity && entity.id && entity.name &&
                                    <li className="relative" key={entity.id}>
                                        <Field
                                            field={entity}
                                            foreignKeys={foreignKeys}
                                            url={`${section.id}/${entity.id}`}
                                            icon="star"
                                            isEditing={isEditing}
                                            formField={fields[entity.id]}
                                        />
                                    </li>
                            )}
                        </List>
                    </div>
                    :
                    <div className={S.empty}>
                        { section.empty &&
                            <EmptyState
                                title={section.empty.title}
                                message={user.is_superuser ?
                                    section.empty.adminMessage || section.empty.message :
                                    section.empty.message
                                }
                                icon={section.empty.icon}
                                image={section.empty.image}
                                action={user.is_superuser ?
                                    section.empty.adminAction || section.empty.action :
                                    section.empty.action
                                }
                                link={user.is_superuser ?
                                    section.empty.adminLink || section.empty.link :
                                    section.empty.link
                                }
                            />
                        }
                    </div>
                }
                </LoadingAndErrorWrapper>
            </form>
        )
    }
}
