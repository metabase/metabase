import React from "react";

import CheckBox from "metabase/components/CheckBox.jsx";

const StackedCheckBox = (props) =>
    <span className={props.className} style={{ ...props.style, position: "relative" }}>
        <CheckBox {...props} className={null} style={{ position: "absolute", top: -3, left: 3, zIndex: -1 }} />
        <CheckBox {...props} className={null} style={{}} />
    </span>

export default StackedCheckBox;
