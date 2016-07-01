/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

import S from "../components/List.css";
import { pure } from "recompose";

import ReferenceEntity from "../containers/ReferenceEntity.jsx";

const List = ({ entityType, entityIds, setItemSelected }) =>
    <ul className={S.list}>
        { entityIds.map(entityId =>
            <ReferenceEntity key={entityId} entityType={entityType} entityId={entityId} />
        )}
    </ul>

List.propTypes = {
    entityType:         PropTypes.string.isRequired,
    entityIds:          PropTypes.array.isRequired,
};

export default pure(List);
