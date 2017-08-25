import React, { Component } from 'react'
import { connect } from 'react-redux'
import { replace as replaceAction } from "react-router-redux";
import _ from "underscore";
import cx from "classnames";

import SearchHeader from "metabase/components/SearchHeader";

import type { LocationDescriptor } from "metabase/meta/types";
import { caseInsensitiveSearch } from "metabase/lib/string";
import Icon from "metabase/components/Icon";
import EmptyState from "metabase/components/EmptyState";
import { Link } from "react-router";

const PAGE_SIZE = 10

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
    getUrlForEntity: (any) => void,

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
        const { title, getUrlForEntity } = this.props;
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
                            className={cx("bg-white bordered", { "rounded": !hasUngroupedResults }, { "rounded-top": hasUngroupedResults })}
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
                                getUrlForEntity={getUrlForEntity}
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
                    key={groupingOption.name}
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
                    "my2 cursor-pointer text-uppercase text-small text-green-saturated-hover",
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
        getUrlForEntity: (any) => void
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
        const { currentGrouping, entities, getUrlForEntity } = this.props;
        const groups = this.getGroups()

        if (groups) {
            return (
                <div className="full">
                    {this.getGroups().map(({ groupName, entitiesInGroup }, index) =>
                        <SearchResultsGroup
                            key={index}
                            groupName={groupName}
                            groupIcon={currentGrouping.icon}
                            entities={entitiesInGroup}
                            getUrlForEntity={getUrlForEntity}
                        />
                    )}
                </div>
            )
        } else {
            // Current grouping seems no-op so just render the results list
            return <SearchResultsList entities={entities} getUrlForEntity={getUrlForEntity} />
        }
    }
}

export const SearchResultsGroup = ({ groupName, groupIcon, entities, getUrlForEntity }) =>
    <div>
        <div className="flex align-center bg-slate-almost-extra-light bordered mt3 px3 py2">
            <Icon className="mr1" style={{color: "#BCC5CA"}} name={groupIcon} />
            <h4>{groupName}</h4>
        </div>
        <SearchResultsList entities={entities} getUrlForEntity={getUrlForEntity} />
    </div>


class SearchResultsList extends Component {
    props: {
        entities: any[],
        getUrlForEntity: () => void
    }

    state = {
        page: 0
    }

    getPaginationSection = (start, end, entityCount) => {
        const { page } = this.state

        const currentEntitiesText = start === end ? `${start + 1}` : `${start + 1}-${end + 1}`
        const isInBeginning = start === 0
        const isInEnd = end + 1 >= entityCount

        return (
            <li className="py1 px3 flex justify-end align-center">
                <span className="text-bold">{ currentEntitiesText }</span>&nbsp;of&nbsp;<span
                className="text-bold">{entityCount}</span>
                <span
                    className={cx(
                        "mx1 flex align-center justify-center rounded",
                        { "cursor-pointer bg-grey-2 text-white": !isInBeginning },
                        { "bg-grey-0 text-grey-1": isInBeginning }
                    )}
                    style={{width: "22px", height: "22px"}}
                    onClick={() => !isInBeginning && this.setState({page: page - 1})}>
                    <Icon name="chevronleft" size={14}/>
                </span>
                <span
                    className={cx(
                        "flex align-center justify-center rounded",
                        { "cursor-pointer bg-grey-2 text-white": !isInEnd },
                        { "bg-grey-0 text-grey-2": isInEnd }
                    )}
                    style={{width: "22px", height: "22px"}}
                    onClick={() => !isInEnd && this.setState({page: page + 1})}>
                        <Icon name="chevronright" size={14}/>
                </span>
            </li>
        )
    }
    render() {
        const { entities, getUrlForEntity } = this.props
        const { page } = this.state

        const showPagination = PAGE_SIZE < entities.length

        let start = PAGE_SIZE * page;
        let end = Math.min(entities.length - 1, PAGE_SIZE * (page + 1) - 1);
        const entityCount = entities.length;

        const entitiesInCurrentPage = entities.slice(start, end + 1)

        return (
            <ol className="Entity-search-results-list flex-full bg-white border-left border-right border-bottom rounded-bottom">
                {entitiesInCurrentPage.map((entity, index) =>
                    <SearchResultListItem key={index} entity={entity} getUrlForEntity={getUrlForEntity}/>
                )}
                {showPagination && this.getPaginationSection(start, end, entityCount)}
            </ol>
        )
    }
}

export class SearchResultListItem extends Component {
    props: {
        entity: any,
        getUrlForEntity: (any) => void
    }

    render() {
        const { entity, getUrlForEntity } = this.props;

        return (
            <li>
                <Link
                    className="no-decoration flex py2 px3 cursor-pointer bg-slate-extra-light-hover border-bottom"
                    to={getUrlForEntity(entity)}
                >
                    <h4 className="text-brand flex-full mr1"> { entity.name } </h4>
                </Link>
            </li>
        )
    }
}
