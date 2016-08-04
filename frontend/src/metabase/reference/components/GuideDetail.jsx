import React, { Component, PropTypes } from "react";
import pure from "recompose/pure";
import cx from "classnames";

import S from "./GuideDetail.css";

const GuideDetail = ({
    title,
    description,
    value,
    link,
    linkClass
}) =>
    <div className={cx("wrapper wrapper--trim", S.guideDetail)}>
        <div className={S.guideDetailTitle}>{title}</div>
        <div className={S.guideDetailBody}>
            <div className={S.guideDetailValue}>{value}</div>
            <div className={S.guideDetailDescription}>{description}</div>
        </div>
    </div>;
GuideDetail.propTypes = {
    title: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
    value: PropTypes.string,
    link: PropTypes.string.isRequired,
    linkClass: PropTypes.string.isRequired
};

export default pure(GuideDetail);
