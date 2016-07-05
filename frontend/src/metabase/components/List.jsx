/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

import S from "./List.css";
import { pure } from "recompose";

const List = ({ children }) =>
    <ul className={S.list}>
        { children }
    </ul>

export default pure(List);
