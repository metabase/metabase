/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import ReactDOM from "react-dom";
import { connect } from "react-redux";
import { reduxForm } from "redux-form";
import i from "icepick";

import * as MetabaseCore from "metabase/lib/core";
import { isNumericBaseType } from "metabase/lib/schema_metadata";

import S from "metabase/components/List.css";
import D from "metabase/components/Detail.css";
import R from "metabase/reference/Reference.css";

import List from "metabase/components/List.jsx";
import Detail from "metabase/components/Detail.jsx";
import Icon from "metabase/components/Icon.jsx";
import Ellipsified from "metabase/components/Ellipsified.jsx";
import IconBorder from "metabase/components/IconBorder.jsx";
import Select from "metabase/components/Select.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import RevisionMessageModal from "metabase/reference/components/RevisionMessageModal.jsx";

import cx from "classnames";

import {
    tryUpdateData
} from '../utils';

import {
    getSection,
    getData,
    getError,
    getLoading,
    getUser,
    getIsEditing,
    getHasDisplayName,
    getHasRevisionHistory,
    getHasSingleSchema,
    getForeignKeys
} from "../selectors";

import * as metadataActions from 'metabase/redux/metadata';
import * as actions from 'metabase/reference/reference';

const mapStateToProps = (state, props) => ({
    section: getSection(state, props),
    entity: getData(state, props) || {},
    loading: getLoading(state, props),
    // naming this 'error' will conflict with redux form
    loadingError: getError(state, props),
    user: getUser(state, props),
    foreignKeys: getForeignKeys(state, props),
    isEditing: getIsEditing(state, props),
    hasSingleSchema: getHasSingleSchema(state, props),
    hasDisplayName: getHasDisplayName(state, props),
    hasRevisionHistory: getHasRevisionHistory(state, props)
});

const mapDispatchToProps = {
    ...metadataActions,
    ...actions
};

const validate = (values, props) => props.hasRevisionHistory ?
    !values.revision_message ?
        { revision_message: "Please enter a revision message" } : {} :
    {};

@connect(mapStateToProps, mapDispatchToProps)
@reduxForm({
    form: 'details',
    fields: ['name', 'display_name', 'description', 'revision_message', 'points_of_interest', 'caveats', 'how_is_this_calculated', 'special_type', 'fk_target_field_id'],
    validate
})
export default class ReferenceEntity extends Component {
    static propTypes = {
        style: PropTypes.object.isRequired,
        entity: PropTypes.object.isRequired,
        user: PropTypes.object.isRequired,
        foreignKeys: PropTypes.object,
        isEditing: PropTypes.bool,
        startEditing: PropTypes.func.isRequired,
        endEditing: PropTypes.func.isRequired,
        startLoading: PropTypes.func.isRequired,
        endLoading: PropTypes.func.isRequired,
        setError: PropTypes.func.isRequired,
        updateField: PropTypes.func.isRequired,
        handleSubmit: PropTypes.func.isRequired,
        resetForm: PropTypes.func.isRequired,
        fields: PropTypes.object.isRequired,
        section: PropTypes.object.isRequired,
        hasSingleSchema: PropTypes.bool,
        hasDisplayName: PropTypes.bool,
        hasRevisionHistory: PropTypes.bool,
        loading: PropTypes.bool,
        loadingError: PropTypes.object,
        submitting: PropTypes.bool
    };

    render() {
        const {
            fields: { name, display_name, description, revision_message, points_of_interest, caveats, how_is_this_calculated, special_type, fk_target_field_id },
            style,
            section,
            entity,
            loadingError,
            loading,
            user,
            foreignKeys,
            isEditing,
            startEditing,
            endEditing,
            hasSingleSchema,
            hasDisplayName,
            hasRevisionHistory,
            handleSubmit,
            submitting
        } = this.props;

        const onSubmit = handleSubmit(async (fields) =>
            await tryUpdateData(fields, this.props)
        );

        return (
            <form style={style} className="full"
                onSubmit={onSubmit}
            >
                { isEditing &&
                    <div className={cx("EditHeader wrapper py1", R.subheader)}>
                        <div>
                            You are editing this page
                        </div>
                        <div className={R.subheaderButtons}>
                            { hasRevisionHistory ?
                                <RevisionMessageModal
                                    action={() => onSubmit()}
                                    field={revision_message}
                                    submitting={submitting}
                                >
                                    <button
                                        className={cx("Button", "Button--primary", "Button--white", "Button--small", R.saveButton)}
                                        type="button"
                                        disabled={submitting}
                                    >
                                        SAVE
                                    </button>
                                </RevisionMessageModal> :
                                <button
                                    className={cx("Button", "Button--primary", "Button--white", "Button--small", R.saveButton)}
                                    type="submit"
                                    disabled={submitting}
                                >
                                    SAVE
                                </button>
                            }

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
                { /* NOTE: this doesn't currently use ReferenceHeader since it is much more complicated */ }
                <div className="wrapper wrapper--trim">
                    <div className={cx("relative", S.header)}>
                        <div className={S.leftIcons}>
                            { section.headerIcon &&
                                <IconBorder borderWidth="0" style={{backgroundColor: "#E9F4F8"}}>
                                    <Icon
                                        className="text-brand"
                                        name={section.headerIcon}
                                        width={24}
                                        height={24}
                                    />
                                </IconBorder>
                            }
                        </div>
                        { section.type === 'table' && !hasSingleSchema && !isEditing &&
                            <div className={R.headerSchema}>{entity.schema}</div>
                        }
                        <div className={R.headerBody} style={isEditing ? {alignItems: "flex-start"} : {}}>
                            { isEditing ?
                                hasDisplayName ?
                                    <input
                                        className={R.headerTextInput}
                                        type="text"
                                        placeholder={entity.name}
                                        {...display_name}
                                        defaultValue={entity.display_name}
                                    /> :
                                    <input
                                        className={R.headerTextInput}
                                        type="text"
                                        placeholder={entity.name}
                                        {...name}
                                        defaultValue={entity.name}
                                    /> :
                                [
                                    <Ellipsified key="1" className={!section.headerLink && "flex-full"} tooltipMaxWidth="100%">
                                        { hasDisplayName ?
                                            entity.display_name || entity.name :
                                            entity.name
                                        }
                                    </Ellipsified>,
                                    section.headerLink &&
                                        <div key="2" className={cx("flex-full", S.headerButton)}>
                                            <Link
                                                to={section.headerLink}
                                                className={cx("Button", "Button--borderless", R.editButton)}
                                                data-metabase-event={`Data Reference;Entity -> QB click;${section.type}`}
                                            >
                                                <div className="flex align-center relative">
                                                    <span className="mr1">See this {section.type}</span>
                                                    <Icon name="chevronright" size={16} />
                                                </div>
                                            </Link>
                                        </div>
                                ]
                            }
                            { user.is_superuser && !isEditing &&
                                <div className={S.headerButton}>
                                    <a
                                        onClick={startEditing}
                                        className={cx("Button", "Button--borderless", R.editButton)}
                                    >
                                        <div className="flex align-center relative">
                                            <Icon name="pencil" size={16} />
                                            <span className="ml1">Edit</span>
                                        </div>
                                    </a>
                                </div>
                            }
                        </div>
                    </div>
                </div>
                <LoadingAndErrorWrapper loading={!loadingError && loading} error={loadingError}>
                { () =>
                    <div className="wrapper wrapper--trim">
                        <List>
                            <li className="relative">
                                <Detail
                                    id="description"
                                    name="Description"
                                    description={entity.description}
                                    placeholder="No description yet"
                                    isEditing={isEditing}
                                    field={description}
                                />
                            </li>
                            { hasDisplayName && !isEditing &&
                                <li className="relative">
                                    <Detail
                                        id="name"
                                        name="Actual name in database"
                                        description={entity.name}
                                    />
                                </li>
                            }
                            <li className="relative">
                                <Detail
                                    id="points_of_interest"
                                    name={`Why this ${section.type} is interesting`}
                                    description={entity.points_of_interest}
                                    placeholder="Nothing interesting yet"
                                    isEditing={isEditing}
                                    field={points_of_interest}
                                    />
                            </li>
                            <li className="relative">
                                <Detail
                                    id="caveats"
                                    name={`Things to be aware of about this ${section.type}`}
                                    description={entity.caveats}
                                    placeholder="Nothing to be aware of yet"
                                    isEditing={isEditing}
                                    field={caveats}
                                />
                            </li>
                            { section.type === 'metric' &&
                                <li className="relative">
                                    <Detail
                                        id="how_is_this_calculated"
                                        name={`How this ${section.type} is calculated`}
                                        description={entity.how_is_this_calculated}
                                        placeholder="Nothing on how it's calculated yet"
                                        isEditing={isEditing}
                                        field={how_is_this_calculated}
                                    />
                                </li>
                            }
                            { !isEditing && section.type === 'field' &&
                                <li className="relative">
                                    <Detail
                                        id="base_type"
                                        name={`Data type`}
                                        description={entity.base_type}
                                    />
                                </li>
                            }
                            { section.type === 'field' &&
                                //TODO: could use some refactoring. a lot of overlap with Field.jsx and ListItem.jsx
                                <li className="relative">
                                    <div className={cx(D.detail)}>
                                        <div className={D.detailBody}>
                                            <div className={D.detailTitle}>
                                                <span className={D.detailName}>Field type</span>
                                            </div>
                                            <div className={cx(D.detailSubtitle, { "mt1" : true })}>
                                                <span>
                                                    { isEditing ?
                                                        <Select
                                                            triggerClasses="rounded bordered p1 inline-block"
                                                            placeholder="Select a field type"
                                                            value={
                                                                MetabaseCore.field_special_types_map[special_type.value] ||
                                                                MetabaseCore.field_special_types_map[entity.special_type]
                                                            }
                                                            options={
                                                                MetabaseCore.field_special_types
                                                                    .concat({
                                                                        'id': null,
                                                                        'name': 'No field type',
                                                                        'section': 'Other'
                                                                    })
                                                                    .filter(type => !isNumericBaseType(entity) ?
                                                                        !(type.id && type.id.startsWith("timestamp_")) :
                                                                        true
                                                                    )
                                                            }
                                                            onChange={(type) => special_type.onChange(type.id)}
                                                        /> :
                                                        <span>
                                                            { i.getIn(
                                                                    MetabaseCore.field_special_types_map,
                                                                    [entity.special_type, 'name']
                                                                ) || 'No field type'
                                                            }
                                                        </span>
                                                    }
                                                </span>
                                                <span className="ml4">
                                                    { isEditing ?
                                                        (special_type.value === 'fk' ||
                                                        (entity.special_type === 'fk' && special_type.value === undefined)) &&
                                                        <Select
                                                            triggerClasses="rounded bordered p1 inline-block"
                                                            placeholder="Select a field type"
                                                            value={
                                                                foreignKeys[fk_target_field_id.value] ||
                                                                foreignKeys[entity.fk_target_field_id] ||
                                                                {name: "Select a Foreign Key"}
                                                            }
                                                            options={Object.values(foreignKeys)}
                                                            onChange={(foreignKey) => fk_target_field_id.onChange(foreignKey.id)}
                                                            optionNameFn={(foreignKey) => foreignKey.name}
                                                        /> :
                                                        entity.special_type === 'fk' &&
                                                        <span>
                                                            {i.getIn(foreignKeys, [entity.fk_target_field_id, "name"])}
                                                        </span>
                                                    }
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </li>
                            }
                        </List>
                    </div>
                }
                </LoadingAndErrorWrapper>
            </form>
        )
    }
}
