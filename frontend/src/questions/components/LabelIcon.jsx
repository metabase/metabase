import React, { Component, PropTypes } from "react";

import S from "./LabelIcon.css";

import Icon from "metabase/components/Icon.jsx";
import EmojiIcon from "./EmojiIcon.jsx";
import cx from "classnames";

const LabelIcon = ({ icon = "", size = 18, className }) =>
    icon.charAt(0) === ":" ?
        <EmojiIcon className={cx(S.icon, S.emojiIcon, className)} name={icon} size={size} />
    : icon.charAt(0) === "#" ?
        <span className={cx(S.icon, S.colorIcon, className)} style={{ backgroundColor: icon, width: size, height: size }}></span>
    :
        <Icon className={cx(S.icon, className)} name={icon} />

export default LabelIcon;
