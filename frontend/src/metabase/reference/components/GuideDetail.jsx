import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import pure from "recompose/pure";
import cx from "classnames";

import S from "./GuideDetail.css";

import {
    getQuestionUrl
} from "../utils";

const GuideDetail = ({
    entity,
    tables,
    type,
    exploreLinks,
    detailLabelClasses
}) => {
    const title = entity.display_name || entity.name;
    const { caveats, points_of_interest } = entity;
    const typeToLink = {
        dashboard: `/dash/${entity.id}`,
        metric: getQuestionUrl({
            dbId: tables[entity.table_id] && tables[entity.table_id].db_id,
            tableId: entity.table_id,
            metricId: entity.id
        }),
        segment: getQuestionUrl({
            dbId: tables[entity.table_id] && tables[entity.table_id].db_id,
            tableId: entity.table_id,
            segmentId: entity.id
        }),
        table: getQuestionUrl({
            dbId: entity.db_id,
            tableId: entity.id
        })
    };
    const link = typeToLink[type];
    const typeToLearnMoreLink = {
        metric: `/reference/metrics/${entity.id}`,
        segment: `/reference/segments/${entity.id}`,
        table: `/reference/databases/${entity.db_id}/tables/${entity.id}`
    };
    const learnMoreLink = typeToLearnMoreLink[type];
    const typeToLinkClass = {
        dashboard: 'text-green',
        metric: 'text-brand',
        segment: 'text-purple',
        table: 'text-purple'
    };
    const linkClass = typeToLinkClass[type];
    const hasLearnMore = type === 'metric' || type === 'segment' || type === 'table';
    const interestingOrImportant = type === 'dashboard' ? 'important' : 'interesting';

    return <div className={S.guideDetail}>
        <div className={S.guideDetailTitle}>
            { title &&
                <Link 
                    className={cx(S.guideDetailLink, linkClass)} 
                    to={link}
                >
                    {title}
                </Link>
            }
        </div>
        <div className={S.guideDetailBody}>
            <div className={S.guideDetailLabel}>
                {`Why this ${type} is ${interestingOrImportant}`}
            </div>
            <div className={cx(S.guideDetailDescription, !points_of_interest && 'text-grey-3')}>
                {points_of_interest || `Nothing ${interestingOrImportant} yet`}
            </div> 
            <div className={S.guideDetailLabel}>
                {`Things to be aware of about this ${type}`} 
            </div>
            <div className={cx(S.guideDetailDescription, !caveats && 'text-grey-3')}>
                {caveats || 'Nothing to be aware of yet'}
            </div>
            { hasLearnMore &&
                <Link 
                    className={cx(linkClass, S.guideDetailLearnMore)}
                    to={learnMoreLink}
                >
                    Learn more
                </Link>
            }
            { exploreLinks && exploreLinks.length > 0 && [
                <div key="detailLabel" className={S.guideDetailLabel}>
                    Explore this metric
                </div>,
                <div key="detailLinks" className={S.guideDetailExploreLinks}>
                    { exploreLinks.map(link => 
                        <Link
                            className={cx(linkClass, S.guideDetailExploreLink)} 
                            key={link.url} 
                            to={link.url}
                        >
                            {`By ${link.name}`}
                        </Link>
                    )}
                </div>
            ]}
        </div>
    </div>;
};
GuideDetail.propTypes = {
    entity: PropTypes.object,
    type: PropTypes.string,
    exploreLinks: PropTypes.array
};

export default pure(GuideDetail);
