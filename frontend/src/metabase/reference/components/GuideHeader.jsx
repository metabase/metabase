import React, { Component, PropTypes } from "react";
import pure from "recompose/pure";

import S from "./GuideHeader.css";

const GuideHeader = ({
    startEditing
}) =>
    <div>
        Understanding our data
    </div>;
GuideHeader.propTypes = {
    startEditing: PropTypes.func.isRequired
};

export default pure(GuideHeader);
