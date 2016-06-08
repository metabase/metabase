import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

const UseForButton = ({ title, onClick }) =>
    <a className="Button Button--white text-default text-brand-hover border-brand-hover no-decoration" onClick={onClick}>
        <Icon className="mr1" name="add" width="12px" height="12px" /> {title}
    </a>

export default UseForButton;
