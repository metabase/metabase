import React, { Component, PropTypes } from "react";

import { emoji } from "metabase/lib/emoji";

const EmojiIcon = ({ size = 18, style, className, name }) =>
    <span className={className} style={{ width: size, height: size, ...style }}>
        {emoji[name].react}
    </span>

export default EmojiIcon;
