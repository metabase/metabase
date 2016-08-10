import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import pure from "recompose/pure";
import cx from "classnames";

import S from "./GuideDetail.css";

const GuideDetail = ({
    entity,
    type
}) => {
    const title = entity.display_name || entity.name;
    const { caveats, points_of_interest } = entity;
    const typeToLink = {
        dashboard: `/dash/${entity.id}`,
        metric: `/reference/metrics/${entity.id}`,
        segment: `/reference/segments/${entity.id}`,
        table: `/reference/databases/${entity.db_id}/tables/${entity.id}`
    };
    const link = typeToLink[type];
    const typeToLinkClass = {
        dashboard: 'text-green',
        metric: 'text-brand',
        segment: 'text-purple',
        table: 'text-purple'
    };
    const linkClass = typeToLinkClass[type];
    const hasLearnMore = type === 'metric' || type === 'segment';
    const exploreLinks = [];
    return <div className={S.guideDetail}>
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
            { points_of_interest && 
                <div className={S.guideDetailDescription}>
                    {points_of_interest}
                </div> 
            }
            { caveats &&
                <div className={S.guideDetailDescription}>
                    {caveats}
                </div>
            }
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
};
GuideDetail.propTypes = {
    entity: PropTypes.object,
    type: PropTypes.string
};

export default pure(GuideDetail);
