/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";
import { reduxForm } from "redux-form";
import i from "icepick";

import S from "metabase/components/List.css";
import R from "metabase/reference/Reference.css";

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

const fieldsToFormFields = (fields) => Object.keys(fields);

const mapStateToProps = (state, props) => {
    const data = getData(state);
    console.log(getForeignKeys(state));
    return {
        section: getSection(state),
        entities: data,
        foreignKeys: getForeignKeys(state),
        loading: getLoading(state),
        error: getError(state),
        user: getUser(state),
        isEditing: getIsEditing(state),
        fields: Object.keys(data)
            .map(key => [`${key}.display_name`, `${key}.special_type`])
            .reduce((array, keys) => array.concat(keys), [])
    };
}

const mapDispatchToProps = {
    ...metadataActions,
    ...actions
};

const validate = (values, props) => {
    console.log(values);
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
        fields: PropTypes.object.isRequired,
        section: PropTypes.object.isRequired,
        loading: PropTypes.bool,
        error: PropTypes.object
    };

    render() {
        const {
            entities,
            fields,
            foreignKeys,
            style,
            section,
            error,
            loading,
            user,
            isEditing,
            startEditing,
            endEditing,
            handleSubmit,
            submitting
        } = this.props;

        const empty = {
            icon: 'mine',
            message: 'You haven\'t added any databases yet.'
        };

        console.log(fields);
        return (
            <div className="full">
                <form
                    onSubmit={handleSubmit(async fields => {
                        console.log(fields)
                        endEditing();
                    })}
                >
                    { isEditing &&
                        <div className={R.subheader}>
                            <div>
                                You are editing this page
                            </div>
                            <div className={R.subheaderButtons}>
                                <button
                                    className={cx("Button", "Button--white", "Button--small", R.saveButton)}
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
                    <LoadingAndErrorWrapper loading={!error && loading} error={error}>
                    { () => Object.keys(entities).length > 0 ?
                        <div className="wrapper wrapper--trim">
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
                          <EmptyState message={empty.message} icon={empty.icon} />
                        </div>
                    }
                    </LoadingAndErrorWrapper>
                </form>
            </div>
        )
    }
}
