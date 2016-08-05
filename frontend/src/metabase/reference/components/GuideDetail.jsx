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
    exploreLinks,
    link,
    linkClass
}) =>
    <div className={S.guideDetail}>
        <div className={S.guideDetailTitle}>
            { title && link &&
                <Link 
                    className={cx(S.guideDetailLink, linkClass)} 
                    to={link}
                >
                    {title}
                </Link>
            }
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
            { exploreLinks && exploreLinks.length > 0 &&
                <div>
                    <div className={S.guideDetailExploreTitle}>
                        Explore this metric
                    </div>
                    <div className={S.guideDetailExploreLinks}>
                        { exploreLinks.map(link => 
                            <Link
                                className={cx(linkClass, S.guideDetailExploreLink)} 
                                key={link.id} 
                                to={link.id}
                            >
                                {`By ${link.name}`}
                            </Link>
                        )}
                    </div>
                </div>
            }
        </div>
    </div>;
GuideDetail.propTypes = {
    title: PropTypes.string,
    description: PropTypes.string.isRequired,
    value: PropTypes.string,
    hasLearnMore: PropTypes.bool,
    exploreLinks: PropTypes.array,
    link: PropTypes.string,
    linkClass: PropTypes.string
};

export default pure(GuideDetail);
