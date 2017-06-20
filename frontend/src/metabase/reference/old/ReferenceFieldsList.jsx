/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { reduxForm } from "redux-form";

import S from "metabase/components/List.css";
import R from "metabase/reference/Reference.css";
import F from "metabase/reference/components/Field.css"

import Field from "metabase/reference/components/Field.jsx";
import List from "metabase/components/List.jsx";
import EmptyState from "metabase/components/EmptyState.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import EditHeader from "metabase/reference/components/EditHeader.jsx";
import ReferenceHeader from "metabase/reference/components/ReferenceHeader.jsx";

import cx from "classnames";

import {
    getSection,
    getData,
    getForeignKeys,
    getError,
    getLoading,
    getUser,
    getIsEditing,
    getHasRevisionHistory,
} from "../selectors";

import {
    tryUpdateFields,
    fieldsToFormFields
} from '../utils';

import { getIconForField } from "metabase/lib/schema_metadata";

import * as metadataActions from "metabase/redux/metadata";
import * as actions from 'metabase/reference/reference';

const mapStateToProps = (state, props) => {
    const data = getData(state, props);
    return {
        section: getSection(state, props),
        entities: data,
        foreignKeys: getForeignKeys(state, props),
        loading: getLoading(state, props),
        loadingError: getError(state, props),
        user: getUser(state, props),
        isEditing: getIsEditing(state, props),
        hasRevisionHistory: getHasRevisionHistory(state, props),
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
        hasRevisionHistory: PropTypes.bool,
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
        submitting: PropTypes.bool,
        resetForm: PropTypes.func
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
            hasRevisionHistory,
            startEditing,
            endEditing,
            resetForm,
            handleSubmit,
            submitting
        } = this.props;

        return (
            <form style={style} className="full"
                onSubmit={handleSubmit(async (formFields) =>
                    await tryUpdateFields(formFields, this.props)
                )}
            >
                { isEditing &&
                    <EditHeader
                        hasRevisionHistory={hasRevisionHistory}
                        reinitializeForm={resetForm}
                        endEditing={endEditing}
                        submitting={submitting}
                    />
                }
                <ReferenceHeader section={section} user={user} isEditing={isEditing} startEditing={startEditing} />
                <LoadingAndErrorWrapper loading={!loadingError && loading} error={loadingError}>
                { () => Object.keys(entities).length > 0 ?
                    <div className="wrapper wrapper--trim">
                        <div className={S.item}>
                            <div className={R.columnHeader}>
                                <div className={cx(S.itemTitle, F.fieldNameTitle)}>
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
                                            icon={getIconForField(entity)}
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
