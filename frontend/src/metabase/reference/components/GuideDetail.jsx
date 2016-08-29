import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import pure from "recompose/pure";
import cx from "classnames";

import {
    getQuestionUrl
} from "../utils";

const GuideDetail = ({
    entity = {},
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

    const linkClass = typeToLinkClass[type]
    const hasLearnMore = type === 'metric' || type === 'segment' || type === 'table';
    const interestingOrImportant = type === 'dashboard' ? 'important' : 'interesting';

    return <div className="relative my4">
        { title && <ItemTitle link={link} title={title} linkColorClass={linkClass} /> }
        <div className="mt2">
            <div>
                <ContextHeading>
                    { `Why this ${type} is ${interestingOrImportant}` }
                </ContextHeading>

                <div className={cx(!points_of_interest && 'text-grey-3')}>
                    {points_of_interest || `Nothing ${interestingOrImportant} yet`}
                </div> 
            </div> 

            <div>
                <ContextHeading>
                    {`Things to be aware of about this ${type}`} 
                </ContextHeading>

                <div className="text-grey-3">
                    {caveats || 'Nothing to be aware of yet'}
                </div>
            </div>
            { hasLearnMore &&
                <Link 
                    className={cx(linkClass)}
                    to={learnMoreLink}
                >
                    Learn more
                </Link>
            }
            { exploreLinks && exploreLinks.length > 0 && [
                <div key="detailLabel">
                    Explore this metric
                </div>,
                <div key="detailLinks">
                    { exploreLinks.map(link => 
                        <Link
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

const ItemTitle = ({ title, link, linkColorClass }) =>
    <h2>
        <Link 
            className={linkColorClass} 
            to={link}
        >
            {title}
        </Link>
    </h2>

const ContextHeading = ({ children }) =>
    <h3 className="mb1">{ children }</h3>

const ContextContent = ({ children }) =>
    <p className="text-paragraph">{ children }</p>

export default pure(GuideDetail);
