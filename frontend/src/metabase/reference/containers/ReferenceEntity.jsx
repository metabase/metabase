/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";
import { reduxForm } from "redux-form";
import i from "icepick";

import S from "metabase/components/List.css";
import List from "metabase/components/List.jsx";
import Item from "metabase/components/Item.jsx";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import cx from "classnames";

import {
    getSection,
    getData,
    getError,
    getLoading,
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
    isEditing: getIsEditing(state),
    hasDisplayName: getHasDisplayName(state),
    hasRevisionHistory: getHasRevisionHistory(state)
});

const mapDispatchToProps = {
    ...metadataActions,
    ...actions
};

@reduxForm({
    form: 'details',
    fields: ['name', 'display_name', 'description', 'revision_message']//, 'points_of_interest', 'caveats'],
})
@connect(mapStateToProps, mapDispatchToProps)
export default class EntityItem extends Component {
    static propTypes = {
        entity: PropTypes.object,
        isEditing: PropTypes.bool
    };

    render() {
        const {
            fields: { name, display_name, description, revision_message }, //, points_of_interest, caveats },
            section,
            entity,
            error,
            loading,
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
                <form onSubmit={handleSubmit(async fields => {
                        console.log(entity)
                        const editedFields = Object.keys(fields)
                            .filter(key => fields[key] !== undefined)
                            .reduce((map, key) => i.assoc(map, key, fields[key]), {});
                        const newEntity = {...entity, ...editedFields};
                        console.log(newEntity)

                        await this.props[section.update](newEntity);
                        endEditing();
                    })}>
                    { isEditing &&
                        <div
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                height: '40px',
                                backgroundColor: '#6CAFED'
                            }}
                        >
                        </div>
                    }
                    <div className="wrapper wrapper--trim">
                        <div className={S.header}>
                            { isEditing ?
                                hasDisplayName ?
                                    <input
                                        type="text"
                                        placeholder={entity.name}
                                        {...display_name}
                                        defaultValue={entity.display_name}
                                    /> :
                                    <input
                                        type="text"
                                        placeholder={entity.name}
                                        {...name}
                                        defaultValue={entity.name}
                                    /> :
                                hasDisplayName ?
                                    entity.display_name || entity.name : entity.name
                            }
                        </div>
                        <a onClick={startEditing} className="Button">Edit</a>
                        <button type="submit" className="Button">Submit</button>
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
                                    // <li className="relative">
                                    //     <Item
                                    //         id="points_of_interest"
                                    //         name={`Why this ${section.type} is interesting`}
                                    //         description={entity.points_of_interest}
                                    //         placeholder="Nothing interesting yet"
                                    //         isEditing={isEditing}
                                    //         field={points_of_interest}
                                    //         />
                                    // </li>
                                    // <li className="relative">
                                    //     <Item
                                    //         id="caveats"
                                    //         name={`Things to be aware of about this ${section.type}`}
                                    //         description={entity.caveats}
                                    //         placeholder="Nothing to be aware of yet"
                                    //     />
                                    // </li>
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
                            </List>
                        </div>
                    }
                    </LoadingAndErrorWrapper>
                </form>
            </div>
        )
    }
}
