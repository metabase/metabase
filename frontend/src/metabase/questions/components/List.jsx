/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";

import S from "./List.css";
import pure from "recompose/pure";

import EntityItem from "../containers/EntityItem.jsx";

const List = ({ entityIds, ...props }) =>
    <ul className={S.list}>
        { entityIds.map(entityId =>
            <EntityItem key={entityId} entityId={entityId} {...props} />
        )}
    </ul>

List.propTypes = {
    entityIds:          PropTypes.array.isRequired,
};

export default pure(List);
