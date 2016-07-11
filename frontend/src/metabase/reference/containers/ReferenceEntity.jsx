/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";
import { reduxForm } from "redux-form";

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
    getHasDisplayName
} from "../selectors";

import * as actions from 'metabase/reference/reference';

const mapStateToProps = (state, props) => ({
    section: getSection(state),
    entity: getData(state) || {},
    loading: getLoading(state),
    error: getError(state),
    isEditing: getIsEditing(state),
    hasDisplayName: getHasDisplayName(state)
});

const mapDispatchToProps = {
    ...actions
};

@reduxForm({
    form: 'details',
    fields: ['name', 'display_name', 'description', 'points_of_interest', 'caveats'],
})
@connect(mapStateToProps, mapDispatchToProps)
export default class EntityItem extends Component {
    static propTypes = {
        entity: PropTypes.object,
        isEditing: PropTypes.bool
    };

    render() {
        const {
            fields: { name, display_name, description, points_of_interest, caveats },
            section,
            entity,
            error,
            loading,
            isEditing,
            startEditing,
            endEditing,
            hasDisplayName,
            handleSubmit,
            submitting
        } = this.props;

        return (
            <div className="full">
                <form onSubmit={handleSubmit(fields => console.log({...entity, ...fields}))}>
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
                                { hasDisplayName &&
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
                            </List>
                        </div>
                    }
                    </LoadingAndErrorWrapper>
                </form>
            </div>
        )
    }
}
