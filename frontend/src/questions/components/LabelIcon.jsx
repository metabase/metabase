import React, { Component, PropTypes } from "react";

import S from "./LabelIcon.css";

import Icon from "metabase/components/Icon.jsx";
import cx from "classnames";

const LabelIcon = ({ icon = "", size = 18}) =>
    icon.charAt(0) === ":" ?
        <span className={S.icon} style={{ width: size, height: size }}>🐱</span>
    : icon.charAt(0) === "#" ?
        <span className={cx(S.icon, S.colorIcon)} style={{ backgroundColor: icon, width: size, height: size }}></span>
    :
        <Icon className={S.icon} name={icon} />

export default LabelIcon;
