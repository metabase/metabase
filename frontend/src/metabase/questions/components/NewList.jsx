/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import pure from "recompose/pure";

import EntityItem from "../containers/EntityItem.jsx";

const List = ({ entityType, entityIds, setItemSelected }) =>
    <ul>
        {
            entityIds.map(entityId =>
                <EntityItem
                    entityId={entityId}
                    entityType={entityType}
                    key={entityId}
                    setItemSelected={setItemSelected}
                />
            )
        }
    </ul>

List.propTypes = {
    entityType:         PropTypes.string.isRequired,
    entityIds:          PropTypes.array.isRequired,
    setItemSelected:    PropTypes.func.isRequired,
};

export default pure(List);
