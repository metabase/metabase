/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

import S from "../components/List.css";
import pure from "recompose/pure";

import EntityItem from "../containers/EntityItem.jsx";

const List = ({ entityType, entityIds, setItemSelected }) =>
    <ul className={S.list}>
        { entityIds.map(entityId =>
            <EntityItem key={entityId} entityType={entityType} entityId={entityId} setItemSelected={setItemSelected} />
        )}
    </ul>

List.propTypes = {
    entityType:         PropTypes.string.isRequired,
    entityIds:          PropTypes.array.isRequired,
    setItemSelected:    PropTypes.func.isRequired,
};

export default pure(List);
