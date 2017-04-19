/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";

import S from "./LabelIcon.css";

import Icon from "./Icon.jsx";
import EmojiIcon from "./EmojiIcon.jsx";
import cx from "classnames";

const LabelIcon = ({ icon, size = 18, className, style }) =>
    !icon ?
        null
    : icon.charAt(0) === ":" ?
        <EmojiIcon className={cx(S.icon, S.emojiIcon, className)} name={icon} size={size} style={style} />
    : icon.charAt(0) === "#" ?
        <span className={cx(S.icon, S.colorIcon, className)} style={{ backgroundColor: icon, width: size, height: size }}></span>
    :
        <Icon className={cx(S.icon, className)} name={icon} />

LabelIcon.propTypes = {
    className:  PropTypes.string,
    style:      PropTypes.object,
    icon:       PropTypes.string,
    size:       PropTypes.number,
};

export default LabelIcon;
