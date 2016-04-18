import React, { Component, PropTypes } from "react";

import S from "../components/List.css";
import { pure } from "recompose";

import EntityItem from "../containers/EntityItem.jsx";

const List = ({ entityType, entityIds, setItemSelected }) =>
    <ul className={S.list}>
        { entityIds.map(entityId =>
            <EntityItem key={entityId} entityType={entityType} entityId={entityId} setItemSelected={setItemSelected} />
        )}
    </ul>

export default pure(List);
