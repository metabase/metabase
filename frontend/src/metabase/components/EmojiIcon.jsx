/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

import { emoji } from "metabase/lib/emoji";

const EmojiIcon = ({ size = 18, style, className, name }) =>
    <span className={className} style={{ width: size, height: size, ...style }}>
        {emoji[name].react}
    </span>

EmojiIcon.propTypes = {
    className:  PropTypes.string,
    style:      PropTypes.object,
    size:       PropTypes.number,
    name:       PropTypes.string.isRequired,
};

export default EmojiIcon;
