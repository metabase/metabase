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
    getQuestionUrl
} from '../utils';


import {
    getSection,
    getData,
    getUser,
    getHasSingleSchema,
    getError,
    getLoading,
    getTable
} from "../selectors";

import * as metadataActions from "metabase/redux/metadata";


// const section = {
//         id: `/reference/databases/${database.id}/tables/${table.id}/questions`,
//         name: `Questions about ${table.display_name}`,
        // empty: {
        //     message: `Questions about this table will appear here as they're added`,
        //     icon: "all",
        //     action: "Ask a question",
        //     link: getQuestionUrl({
        //         dbId: table.db_id,
        //         tableId: table.id,
        //     })
        // },
//         type: 'questions',
//         sidebar: 'Questions about this table',
//         breadcrumb: `${table.display_name}`,
//         fetch: {
//             fetchDatabaseMetadata: [database.id], fetchQuestions: []
//         },
//         get: 'getTableQuestions',
//         icon: "all",
//         headerIcon: "table2",
//         parent: getDatabaseSections(database)[`/reference/databases/${database.id}/tables`]
//     }

const emptyStateData = (table) =>  {
    return {
        message: "Questions about this table will appear here as they're added",
        icon: "all",
        action: "Ask a question",
        link: getQuestionUrl({
            dbId: table.db_id,
            tableId: table.id,
        })
    }
}


const mapStateToProps = (state, props) => ({
    table: getTable(state, props),
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
export default class TableQuestions extends Component {
    static propTypes = {
        table: PropTypes.object.isRequired,
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
                        { section.empty &&
                            <AdminAwareEmptyState {...emptyStateData(this.props.table)}/>
                        }
                    </div>
                }
                </LoadingAndErrorWrapper>
            </div>
        )
    }
}
