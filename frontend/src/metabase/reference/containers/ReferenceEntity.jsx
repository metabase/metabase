/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";
import { reduxForm } from "redux-form";
import i from "icepick";

import S from "metabase/components/List.css";
import R from "metabase/reference/Reference.css";

import List from "metabase/components/List.jsx";
import Item from "metabase/components/Item.jsx";
import Icon from "metabase/components/Icon.jsx";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import cx from "classnames";

import {
    getSection,
    getData,
    getError,
    getLoading,
    getUser,
    getIsEditing,
    getHasDisplayName,
    getHasRevisionHistory
} from "../selectors";

import * as metadataActions from 'metabase/redux/metadata';
import * as actions from 'metabase/reference/reference';

const mapStateToProps = (state, props) => ({
    section: getSection(state),
    entity: getData(state) || {},
    loading: getLoading(state),
    error: getError(state),
    user: getUser(state),
    isEditing: getIsEditing(state),
    hasDisplayName: getHasDisplayName(state),
    hasRevisionHistory: getHasRevisionHistory(state)
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
    fields: ['name', 'display_name', 'description', 'revision_message', 'points_of_interest', 'caveats'],
    validate
})
export default class EntityItem extends Component {
    static propTypes = {
        entity: PropTypes.object,
        isEditing: PropTypes.bool,
        user: PropTypes.object,
    };

    render() {
        const {
            fields: { name, display_name, description, revision_message, points_of_interest, caveats },
            section,
            entity,
            error,
            loading,
            user,
            isEditing,
            startEditing,
            endEditing,
            hasDisplayName,
            hasRevisionHistory,
            handleSubmit,
            submitting
        } = this.props;

        return (
            <div className="full">
                <form
                    onSubmit={handleSubmit(async fields => {
                        const editedFields = Object.keys(fields)
                            .filter(key => fields[key] !== undefined)
                            .reduce((map, key) => i.assoc(map, key, fields[key]), {});
                        const newEntity = {...entity, ...editedFields};

                        await this.props[section.update](newEntity);
                        endEditing();
                    })}
                    hasRevisionHistory={hasRevisionHistory}
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
                            { isEditing ?
                                hasDisplayName ?
                                    <input
                                        className={S.headerTextInput}
                                        type="text"
                                        placeholder={entity.name}
                                        {...display_name}
                                        defaultValue={entity.display_name}
                                    /> :
                                    <input
                                        className={S.headerTextInput}
                                        type="text"
                                        placeholder={entity.name}
                                        {...name}
                                        defaultValue={entity.name}
                                    /> :
                                hasDisplayName ?
                                    entity.display_name || entity.name : entity.name
                            }
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
                    { () =>
                        <div className="wrapper wrapper--trim">
                            <List>
                                <li className="relative">
                                    <Item
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
                                        <Item
                                            name="Actual name in database"
                                            description={entity.name}
                                        />
                                    </li>
                                }
                                { hasRevisionHistory && isEditing &&
                                    // make this required and validate for it
                                    <li className="relative">
                                        <Item
                                            id="revision_message"
                                            name="Reason for changes"
                                            description=""
                                            placeholder="Leave a note to explain what changes you made and why they were required."
                                            isEditing={isEditing}
                                            field={revision_message}
                                        />
                                    </li>
                                }
                                <li className="relative">
                                    <Item
                                        id="points_of_interest"
                                        name={`Why this ${section.type} is interesting`}
                                        description={entity.points_of_interest}
                                        placeholder="Nothing interesting yet"
                                        isEditing={isEditing}
                                        field={points_of_interest}
                                        />
                                </li>
                                <li className="relative">
                                    <Item
                                        id="caveats"
                                        name={`Things to be aware of about this ${section.type}`}
                                        description={entity.caveats}
                                        placeholder="Nothing to be aware of yet"
                                        isEditing={isEditing}
                                        field={points_of_interest}
                                    />
                                </li>
                            </List>
                        </div>
                    }
                    </LoadingAndErrorWrapper>
                </form>
            </div>
        )
    }
}
