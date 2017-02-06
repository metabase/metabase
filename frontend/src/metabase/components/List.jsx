/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

import S from "./List.css";
import pure from "recompose/pure";

const List = ({ children }) =>
    <ul className={S.list}>
        { children }
    </ul>

List.propTypes = {
    children:   PropTypes.any.isRequired
};

export default pure(List);
