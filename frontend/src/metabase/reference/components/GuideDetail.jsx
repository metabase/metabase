import React, { Component, PropTypes } from "react";
import pure from "recompose/pure";

import S from "./GuideDetail.css";

const GuideDetail = ({
    name,
    description,
    value,
    link,
    linkClass
}) =>
    <div>
        Understanding our data
    </div>;
GuideDetail.propTypes = {
    name: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
    value: PropTypes.string,
    link: PropTypes.string.isRequired,
    linkClass: PropTypes.string.isRequired
};

export default pure(GuideDetail);
