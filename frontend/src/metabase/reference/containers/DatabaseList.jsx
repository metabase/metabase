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
import EmptyState from "metabase/components/EmptyState.jsx";

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
//         id: `/reference/databases`,
//         name: "Databases and tables",
//         empty: {
//             title: "Metabase is no fun without any data",
//             adminMessage: "Your databses will appear here once you connect one",
//             message: "Databases will appear here once your admins have added some",
//             image: "app/assets/img/databases-list",
//             adminAction: "Connect a database",
//             adminLink: "/admin/databases/create"
//         },
//         breadcrumb: "Databases",
//         fetch: {
//             fetchMetrics: [],
//             fetchSegments: [],
//             fetchDatabases: []
//         },
//         get: 'getDatabases',
//         icon: "database",
//         itemIcon: "database"
//     }

const emptyStateData = {
            title: "Metabase is no fun without any data",
            adminMessage: "Your databses will appear here once you connect one",
            message: "Databases will appear here once your admins have added some",
            image: "app/assets/img/databases-list",
            adminAction: "Connect a database",
            adminLink: "/admin/databases/create"
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
export default class DatabaseList extends Component {
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
                            <EmptyState {...emptyStateForUser(emptyStateData)}/>
                    </div>
                }
                </LoadingAndErrorWrapper>
            </div>
        )
    }
}
