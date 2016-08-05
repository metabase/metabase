import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import pure from "recompose/pure";
import cx from "classnames";

import S from "./GuideDetail.css";

const GuideDetail = ({
    title,
    description,
    value,
    hasLearnMore,
    link,
    linkClass
}) =>
    <div className={S.guideDetail}>
        <div className={S.guideDetailTitle}>
            <Link className={cx(S.guideDetailLink, linkClass)} to={link}>{title}</Link>
        </div>
        <div className={S.guideDetailBody}>
            { value &&
                <div className={S.guideDetailValue}>{value}</div>
            }
            <div className={S.guideDetailDescription}>{description}</div>
            { hasLearnMore &&
                <Link 
                    className={cx(linkClass, S.guideDetailLearnMore)}
                    to={link}
                >
                    Learn more
                </Link>
            }
        </div>
    </div>;
GuideDetail.propTypes = {
    title: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
    value: PropTypes.string,
    hasLearnMore: PropTypes.bool,
    link: PropTypes.string.isRequired,
    linkClass: PropTypes.string.isRequired
};

export default pure(GuideDetail);
