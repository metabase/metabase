/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";

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
    getError,
    getLoading,
    getUser,
    getIsEditing,
} from "../selectors";

import * as metadataActions from "metabase/redux/metadata";
import * as actions from 'metabase/reference/reference';

const mapStateToProps = (state, props) => ({
    section: getSection(state),
    fields: getData(state),
    loading: getLoading(state),
    error: getError(state),
    user: getUser(state),
    isEditing: getIsEditing(state)
});

const mapDispatchToProps = {
    ...metadataActions,
    ...actions
};

@connect(mapStateToProps, mapDispatchToProps)
export default class ReferenceEntityList extends Component {
    static propTypes = {
        style: PropTypes.object.isRequired,
        fields: PropTypes.object.isRequired,
        section: PropTypes.object.isRequired,
        loading: PropTypes.bool,
        error: PropTypes.object
    };

    render() {
        const {
            fields,
            style,
            section,
            error,
            loading,
            user,
            isEditing,
            startEditing,
            endEditing,
            submitting
        } = this.props;

        const empty = {
            icon: 'mine',
            message: 'You haven\'t added any databases yet.'
        };
        return (
            <div className="full">
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
                { () => Object.keys(fields).length > 0 ?
                    <div className="wrapper wrapper--trim">
                        <List>
                            { Object.values(fields).map(field =>
                                field && field.id && field.name &&
                                    <li className="relative" key={field.id}>
                                        <Field
                                            field={field}
                                            url={`${section.id}/${field.id}`}
                                            icon="star"
                                            isEditing={isEditing}
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
            </div>
        )
    }
}
