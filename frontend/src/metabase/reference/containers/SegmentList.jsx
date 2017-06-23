/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import moment from "moment";

import visualizations from "metabase/visualizations";
import { isQueryable } from "metabase/lib/table";
import * as Urls from "metabase/lib/urls";

import S from "metabase/components/List.css";
import R from "metabase/reference/Reference.css";

import List from "metabase/components/List.jsx";
import ListItem from "metabase/components/ListItem.jsx";
import AdminAwareEmptyState from "metabase/components/AdminAwareEmptyState.jsx";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import ReferenceHeader from "../components/ReferenceHeader.jsx";

import {
    separateTablesBySchema,
    emptyStateForUser
} from '../utils';

import {
    getSection,
    getData,
    getUser,
    getHasSingleSchema,
    getError,
    getLoading
} from "../selectors";

import * as metadataActions from "metabase/redux/metadata";

// const section = {
//         id: `/reference/segments`,
//         name: "Segments",
//         empty: {
//             title: "Segments are interesting subsets of tables",
//             adminMessage: "Defining common segments for your team makes it even easier to ask questions",
//             message: "Segments will appear here once your admins have created some",
//             image: "app/assets/img/segments-list",
//             adminAction: "Learn how to create segments",
//             adminLink: "http://www.metabase.com/docs/latest/administration-guide/06-segments-and-metrics.html"
//         },
//         breadcrumb: "Segments",
//         fetch: {
//             fetchMetrics: [],
//             fetchSegments: []
//         },
//         get: 'getSegments',
//         icon: "segment"
//     }

const emptyStateData = {
            title: "Segments are interesting subsets of tables",
            adminMessage: "Defining common segments for your team makes it even easier to ask questions",
            message: "Segments will appear here once your admins have created some",
            image: "app/assets/img/segments-list",
            adminAction: "Learn how to create segments",
            adminLink: "http://www.metabase.com/docs/latest/administration-guide/06-segments-and-metrics.html"
        }

const mapStateToProps = (state, props) => ({
    section: getSection(state, props),
    entities: getData(state, props),
    user: getUser(state, props),
    hasSingleSchema: getHasSingleSchema(state, props),
    loading: getLoading(state, props),
    loadingError: getError(state, props)
});

const mapDispatchToProps = {
    ...metadataActions
};

const createListItem = (entity, index, section) =>
    <li className="relative" key={entity.id}>
        <ListItem
            id={entity.id}
            index={index}
            name={entity.display_name || entity.name}
            description={section.type !== 'questions' ?
                entity.description :
                `Created ${moment(entity.created_at).fromNow()} by ${entity.creator.common_name}`
            }
            url={section.type !== 'questions' ?
                `${section.id}/${entity.id}` :
                Urls.question(entity.id)
            }
            icon={section.type === 'questions' ?
                visualizations.get(entity.display).iconName :
                section.icon
            }
        />
    </li>;

const createSchemaSeparator = (entity) =>
    <li className={R.schemaSeparator}>{entity.schema}</li>;

@connect(mapStateToProps, mapDispatchToProps)
export default class SegmentList extends Component {
    static propTypes = {
        style: PropTypes.object.isRequired,
        entities: PropTypes.object.isRequired,
        user: PropTypes.object.isRequired,
        section: PropTypes.object.isRequired,
        hasSingleSchema: PropTypes.bool,
        loading: PropTypes.bool,
        loadingError: PropTypes.object
    };

    render() {
        const {
            entities,
            user,
            style,
            section,
            hasSingleSchema,
            loadingError,
            loading
        } = this.props;

        return (
            <div style={style} className="full">
                <ReferenceHeader section={section} />
                <LoadingAndErrorWrapper loading={!loadingError && loading} error={loadingError}>
                { () => Object.keys(entities).length > 0 ?
                    <div className="wrapper wrapper--trim">
                        <List>
                            { section.type === "tables" && !hasSingleSchema ?
                                separateTablesBySchema(
                                    entities,
                                    section,
                                    createSchemaSeparator,
                                    createListItem
                                ) :
                                Object.values(entities).filter(isQueryable).map((entity, index) =>
                                    entity && entity.id && entity.name &&
                                        createListItem(entity, index, section)
                                )
                            }
                        </List>
                    </div>
                    :
                    <div className={S.empty}>
                        <AdminAwareEmptyState {...emptyStateData}/>
                        }
                    </div>
                }
                </LoadingAndErrorWrapper>
            </div>
        )
    }
}
