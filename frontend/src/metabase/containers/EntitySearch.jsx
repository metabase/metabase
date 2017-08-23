import React, { Component } from 'react'
import { connect } from 'react-redux'
import { replace as replaceAction } from "react-router-redux";
import _ from "underscore";
import cx from "classnames";

import SearchHeader from "metabase/components/SearchHeader";

import type { LocationDescriptor } from "metabase/meta/types";
import Ellipsified from "metabase/components/Ellipsified";
import { caseInsensitiveSearch } from "metabase/lib/string";
import Icon from "metabase/components/Icon";
import EmptyState from "metabase/components/EmptyState";

const PAGE_SIZE = 5

const SEARCH_GROUPINGS = [
    {
        name: "Name",
        icon: "calendar",
        groupBy: null,
        getGroupName: null
    },
    {
        name: "Table",
        icon: "table2",
        groupBy: (entity) => entity.table.id,
        getGroupName: (entity) => entity.table.display_name
    },
    {
        name: "Database",
        icon: "database",
        groupBy: (entity) => entity.table.db.id,
        getGroupName: (entity) => entity.table.db.name
    },
    {
        name: "Creator",
        icon: "mine",
        groupBy: (entity) => entity.creator.id,
        getGroupName: (entity) => entity.creator.common_name
    },
]
const DEFAULT_SEARCH_GROUPING = SEARCH_GROUPINGS[0]

type Props = {
    // Component parameters
    title: string,
    entities: any[],
    chooseEntity: (any) => void,

    // Properties injected with redux connect
    replace: (location: LocationDescriptor) => void,

    // Injected by withRouter HOC
    location: LocationDescriptor,
}

@connect(null, { replace: replaceAction })
export default class EntitySearch extends Component {
    searchHeaderInput: ?HTMLButtonElement
    props: Props

    constructor(props) {
        super(props);
        this.state = {
            filteredEntities: props.entities,
            currentGrouping: DEFAULT_SEARCH_GROUPING,
            searchText: ""
        };
    }

    componentWillReceiveProps = (nextProps) => {
        this.applyFiltersForEntities(nextProps.entities)
    }

    setSearchText = (searchText) => {
        // TODO: we maybe want to reflect the search text in the url, at least in new question flow
        // this.props.replace({
        //     pathname: location.pathname,
        //     search: `?search=${searchText}`
        // });
        this.setState({ searchText }, this.applyFiltersAfterFilterChange)
    }

    resetSearchText = () => {
        this.setSearchText("")
        this.searchHeaderInput.focus()
    }

    applyFiltersAfterFilterChange = () => this.applyFiltersForEntities(this.props.entities)

    applyFiltersForEntities = (entities) => {
        const { searchText } = this.state;

        if (searchText !== "") {
            const filteredEntities = entities.filter(({ name, description }) =>
                caseInsensitiveSearch(name, searchText) ||
                (description && caseInsensitiveSearch(description, searchText))
            )

            this.setState({ filteredEntities })
        }
        else {
            this.setState({ filteredEntities: entities })
        }
    }

    setGrouping = (grouping) => {
        this.setState({ currentGrouping: grouping })
        this.searchHeaderInput.focus()
    }

    render() {
        const { title, chooseEntity } = this.props;
        const { searchText, currentGrouping, filteredEntities } = this.state;

        const hasUngroupedResults = !currentGrouping.groupBy && filteredEntities.length > 0

        return (
            <div className="bg-slate-extra-light full Entity-search">
                <div className="wrapper wrapper--small pt4 pb4">
                    <div className="flex mb4 align-center" style={{ height: "50px" }}>
                        <Icon
                            className="Entity-search-back-button shadowed cursor-pointer text-grey-4 mr2 flex align-center circle p2 bg-white transition-background transition-color"
                            style={{
                                border: "1px solid #DCE1E4",
                                boxShadow: "0 2px 4px 0 #DCE1E4"
                            }}
                            name="backArrow"
                            onClick={ () => window.history.back() }
                        />
                        <div className="text-centered flex-full">
                            <h2>{title}</h2>
                        </div>
                    </div>
                    <div>
                        <SearchGroupingOptions
                            currentGrouping={currentGrouping}
                            setGrouping={this.setGrouping}
                        />
                        <div
                            className={cx("bg-white bordered border-grey-1", { "rounded": !hasUngroupedResults }, { "rounded-top": hasUngroupedResults })}
                            style={{ padding: "5px 15px" }}
                        >
                            <SearchHeader
                                searchText={searchText}
                                setSearchText={this.setSearchText}
                                autoFocus
                                inputRef={el => this.searchHeaderInput = el}
                                resetSearchText={this.resetSearchText}
                            />
                        </div>
                        { filteredEntities.length > 0 &&
                            <GroupedSearchResultsList
                                currentGrouping={currentGrouping}
                                entities={filteredEntities}
                                chooseEntity={chooseEntity}
                            />
                        }
                        { filteredEntities.length === 0 &&
                            <div className="mt4">
                                <EmptyState
                                    message={
                                        <div className="mt4">
                                            <h3 className="text-grey-5">No results found</h3>
                                            <p className="text-grey-4">Try adjusting your filter to find what you’re
                                                looking for.</p>
                                        </div>
                                    }
                                    image="/app/img/empty_question"
                                    imageHeight="213px"
                                    imageClassName="mln2"
                                    smallDescription
                                />
                            </div>
                        }
                    </div>
                </div>
            </div>
        )
    }
}

export const SearchGroupingOptions = ({ currentGrouping, setGrouping }) =>
    <div className="Entity-search-grouping-options">
        <h3 className="mb3">View by</h3>
        <ul>
            { SEARCH_GROUPINGS.map((groupingOption) =>
                <SearchGroupingOption
                    grouping={groupingOption}
                    active={currentGrouping === groupingOption}
                    setGrouping={setGrouping}
                />
            )}
        </ul>
    </div>

export class SearchGroupingOption extends Component {
    props: {
        grouping: any,
        active: boolean,
        setGrouping: (any) => boolean
    }

    onSetGrouping = () => {
        this.props.setGrouping(this.props.grouping)
    }

    render() {
        const { grouping, active } = this.props;

        return (
            <li
                className={cx(
                    "my2 cursor-pointer text-uppercase text-green-saturated-hover",
                    {"text-grey-4": !active},
                    {"text-green-saturated": active}
                )}
                onClick={this.onSetGrouping}
            >
                {grouping.name}
            </li>
        )
    }
}
export class GroupedSearchResultsList extends Component {
    props: {
        currentGrouping: any,
        entities: any,
        chooseEntity: (any) => void
    }

    getGroups = () => {
        const { currentGrouping, entities } = this.props;

        if (currentGrouping.groupBy === null) return null;

        return _.chain(entities)
            .groupBy(currentGrouping.groupBy)
            .pairs()
            .map(([groupId, entitiesInGroup]) => ({
                groupName: currentGrouping.getGroupName(entitiesInGroup[0]),
                entitiesInGroup
            }))
            .sortBy(({ groupName }) => groupName.toLowerCase())
            .value()
    }

    render() {
        const { currentGrouping, entities, chooseEntity } = this.props;

        const groups = this.getGroups()

        if (groups) {
            return (
                <div className="full">
                    {this.getGroups().map(({ groupName, entitiesInGroup }) =>
                        <SearchResultsGroup
                            groupName={groupName}
                            groupIcon={currentGrouping.icon}
                            entities={entitiesInGroup}
                            chooseEntity={chooseEntity}
                        />
                    )}
                </div>
            )
        } else {
            // Current grouping seems no-op so just render the results list
            return <SearchResultsList entities={entities} chooseEntity={chooseEntity} />
        }
    }
}

export const SearchResultsGroup = ({ groupName, groupIcon, entities, chooseEntity }) =>
    <div>
        <div className="flex align-center bg-slate-almost-extra-light border-grey-1 bordered mt3 px3 py2">
            <Icon className="mr1 text-grey-3" name={groupIcon} />
            <h4>{groupName}</h4>
        </div>
        <SearchResultsList entities={entities} chooseEntity={chooseEntity} />
    </div>


class SearchResultsList extends Component {
    props: {
        entities: any[],
        chooseEntity: () => void
    }

    state = {
        page: 0
    }

    getPaginationSection = (start, end, entityCount) => {
        const { page } = this.state

        const currentEntitiesText = start === end ? `${start + 1}` : `${start + 1}-${end + 1}`
        return (
            <li className="py1 px3 flex justify-end align-center">
                <span className="text-bold">{ currentEntitiesText }</span>&nbsp;of&nbsp;<span
                className="text-bold">{entityCount}</span>
                <span
                    className={cx("mx1 flex align-center justify-center rounded", {"cursor-pointer bg-grey-3 text-white": start !== 0}, {"bg-grey-1 text-grey-3": start === 0})}
                    style={{width: "25px", height: "25px"}}
                    onClick={() => this.setState({page: page - 1})}>
                            <Icon name="chevronleft" size={15}/>
                        </span>
                <span
                    className={cx(
                        "flex align-center justify-center rounded",
                        { "cursor-pointer bg-grey-3 text-white": end + 1 < entityCount },
                        { "bg-grey-1 text-grey-3": end + 1 >= entityCount }
                    )}
                    style={{width: "25px", height: "25px"}}
                    onClick={() => this.setState({page: page + 1})}>
                            <Icon name="chevronright" size={15}/>
                        </span>
            </li>
        )
    }
    render() {
        const { entities, chooseEntity } = this.props
        const { page } = this.state

        const showPagination = PAGE_SIZE < entities.length

        let start = PAGE_SIZE * page;
        let end = Math.min(entities.length - 1, PAGE_SIZE * (page + 1) - 1);
        const entityCount = entities.length;

        const entitiesInCurrentPage = entities.slice(start, end + 1)

        return (
            <ol className="Entity-search-results-list flex-full bg-white border-left border-right border-bottom rounded-bottom border-grey-1">
                {entitiesInCurrentPage.map((entity) =>
                    <SearchResultListItem entity={entity} chooseEntity={chooseEntity}/>
                )}
                {showPagination && this.getPaginationSection(start, end, entityCount)}
            </ol>
        )
    }
}

export class SearchResultListItem extends Component {
    props: {
        entity: any,
        chooseEntity: (any) => void
    }

    onClick = () => {
        const { entity, chooseEntity } = this.props;
        chooseEntity(entity)
    }

    render() {
        const { entity } = this.props;
        const hasDescription = !!entity.description;

        return (
            <li
                className="flex py2 px3 cursor-pointer bg-slate-extra-light-hover border-bottom"
                onClick={this.onClick}
            >
                <h4 className="text-brand flex-full mr1"> { entity.name } </h4>
                { hasDescription && // take care of cutting off long description
                <div className="text-grey-4 text-small" style={{ maxWidth: "400px"}}>
                    <Ellipsified>{ entity.description }</Ellipsified>
                </div>
                }
                { !hasDescription &&
                <div className="text-grey-2 text-small"> No description </div>
                }
            </li>
        )
    }
}
