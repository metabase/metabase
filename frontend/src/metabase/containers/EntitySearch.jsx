import React, { Component } from "react";
import { connect } from "react-redux";
import { push, replace } from "react-router-redux";
import _ from "underscore";
import cx from "classnames";
import { t } from "c-3po";

import SearchHeader from "metabase/components/SearchHeader";
import DirectionalButton from "metabase/components/DirectionalButton";

import { caseInsensitiveSearch } from "metabase/lib/string";
import Icon from "metabase/components/Icon";
import EmptyState from "metabase/components/EmptyState";
import { Link, withRouter } from "react-router";
import { KEYCODE_DOWN, KEYCODE_ENTER, KEYCODE_UP } from "metabase/lib/keyboard";
import { LocationDescriptor } from "metabase/meta/types/index";
import { parseHashOptions, updateQueryString } from "metabase/lib/browser";

const PAGE_SIZE = 10;

const SEARCH_GROUPINGS = [
  {
    id: "name",
    name: t`Name`,
    icon: null,
    // Name grouping is a no-op grouping so always put all results to same group with identifier `0`
    groupBy: () => 0,
    // Setting name to null hides the group header in SearchResultsGroup component
    getGroupName: () => null,
  },
  {
    id: "table",
    name: t`Table`,
    icon: "table2",
    groupBy: entity => entity.table.id,
    getGroupName: entity => entity.table.display_name,
  },
  {
    id: "database",
    name: t`Database`,
    icon: "database",
    groupBy: entity => entity.table.db.id,
    getGroupName: entity => entity.table.db.name,
  },
  {
    id: "creator",
    name: t`Creator`,
    icon: "mine",
    groupBy: entity => entity.creator.id,
    getGroupName: entity => entity.creator.common_name,
  },
];
const DEFAULT_SEARCH_GROUPING = SEARCH_GROUPINGS[0];

type Props = {
  title: string,
  entities: any[], // Sorted list of entities like segments or metrics
  getUrlForEntity: any => void,
  backButtonUrl: ?string,

  onReplaceLocation: LocationDescriptor => void,
  onChangeLocation: LocationDescriptor => void,

  location: LocationDescriptor, // Injected by withRouter HOC
};

@connect(null, { onReplaceLocation: replace, onChangeLocation: push })
@withRouter
export default class EntitySearch extends Component {
  searchHeaderInput: ?HTMLButtonElement;
  props: Props;

  constructor(props) {
    super(props);
    this.state = {
      filteredEntities: props.entities,
      currentGrouping: DEFAULT_SEARCH_GROUPING,
      searchText: "",
    };
  }

  componentDidMount = () => {
    this.parseQueryString();
  };

  componentWillReceiveProps = nextProps => {
    this.applyFiltersForEntities(nextProps.entities);
  };

  parseQueryString = () => {
    const options = parseHashOptions(this.props.location.search.substring(1));
    if (Object.keys(options).length > 0) {
      if (options.search) {
        this.setSearchText(String(options.search));
      }
      if (options.grouping) {
        const grouping = SEARCH_GROUPINGS.find(
          grouping => grouping.id === options.grouping,
        );
        if (grouping) {
          this.setGrouping(grouping);
        }
      }
    }
  };

  updateUrl = queryOptionsUpdater => {
    const { onReplaceLocation, location } = this.props;
    onReplaceLocation(updateQueryString(location, queryOptionsUpdater));
  };

  setSearchText = searchText => {
    this.setState({ searchText }, this.applyFiltersAfterFilterChange);
    this.updateUrl(
      currentOptions =>
        searchText !== ""
          ? { ...currentOptions, search: searchText }
          : _.omit(currentOptions, "search"),
    );
  };

  resetSearchText = () => {
    this.setSearchText("");
    this.searchHeaderInput.focus();
  };

  applyFiltersAfterFilterChange = () =>
    this.applyFiltersForEntities(this.props.entities);

  applyFiltersForEntities = entities => {
    const { searchText } = this.state;

    if (searchText !== "") {
      const filteredEntities = entities.filter(({ name, description }) =>
        caseInsensitiveSearch(name, searchText),
      );

      this.setState({ filteredEntities });
    } else {
      this.setState({ filteredEntities: entities });
    }
  };

  setGrouping = grouping => {
    this.setState({ currentGrouping: grouping });
    this.updateUrl(
      currentOptions =>
        grouping !== DEFAULT_SEARCH_GROUPING
          ? { ...currentOptions, grouping: grouping.id }
          : _.omit(currentOptions, "grouping"),
    );
    this.searchHeaderInput.focus();
  };

  // Returns an array of groups based on current grouping. The groups are sorted by their name.
  // Entities inside each group aren't separately sorted as EntitySearch expects that the `entities`
  // is already in the desired order.
  getGroups = () => {
    const { currentGrouping, filteredEntities } = this.state;

    return _.chain(filteredEntities)
      .groupBy(currentGrouping.groupBy)
      .pairs()
      .map(([groupId, entitiesInGroup]) => ({
        groupName: currentGrouping.getGroupName(entitiesInGroup[0]),
        entitiesInGroup,
      }))
      .sortBy(({ groupName }) => groupName !== null && groupName.toLowerCase())
      .value();
  };

  render() {
    const {
      title,
      backButtonUrl,
      getUrlForEntity,
      onChangeLocation,
    } = this.props;
    const { searchText, currentGrouping, filteredEntities } = this.state;

    const hasUngroupedResults =
      currentGrouping === DEFAULT_SEARCH_GROUPING &&
      filteredEntities.length > 0;

    return (
      <div className="bg-slate-extra-light full Entity-search">
        <div className="wrapper wrapper--small pt4 pb4">
          <div className="flex mb4 align-center" style={{ height: "50px" }}>
            <div
              className="Entity-search-back-button mr2"
              onClick={() =>
                backButtonUrl
                  ? onChangeLocation(backButtonUrl)
                  : window.history.back()
              }
            >
              <DirectionalButton direction="back" />
            </div>
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
              className={cx(
                "bg-white bordered",
                { rounded: !hasUngroupedResults },
                { "rounded-top": hasUngroupedResults },
              )}
              style={{ padding: "5px 15px" }}
            >
              <SearchHeader
                searchText={searchText}
                setSearchText={this.setSearchText}
                autoFocus
                inputRef={el => (this.searchHeaderInput = el)}
                resetSearchText={this.resetSearchText}
              />
            </div>
            {filteredEntities.length > 0 && (
              <GroupedSearchResultsList
                groupingIcon={currentGrouping.icon}
                groups={this.getGroups()}
                getUrlForEntity={getUrlForEntity}
              />
            )}
            {filteredEntities.length === 0 && (
              <div className="mt4">
                <EmptyState
                  message={
                    <div className="mt4">
                      <h3 className="text-grey-5">{t`No results found`}</h3>
                      <p className="text-grey-4">{t`Try adjusting your filter to find what you’re looking for.`}</p>
                    </div>
                  }
                  image="app/img/empty_question"
                  imageHeight="213px"
                  imageClassName="mln2"
                  smallDescription
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}

export const SearchGroupingOptions = ({ currentGrouping, setGrouping }) => (
  <div className="Entity-search-grouping-options">
    <h3 className="mb3">{t`View by`}</h3>
    <ul>
      {SEARCH_GROUPINGS.map(groupingOption => (
        <SearchGroupingOption
          key={groupingOption.name}
          grouping={groupingOption}
          active={currentGrouping === groupingOption}
          setGrouping={setGrouping}
        />
      ))}
    </ul>
  </div>
);

export class SearchGroupingOption extends Component {
  props: {
    grouping: any,
    active: boolean,
    setGrouping: any => boolean,
  };

  onSetGrouping = () => {
    this.props.setGrouping(this.props.grouping);
  };

  render() {
    const { grouping, active } = this.props;

    return (
      <li
        className={cx(
          "my2 cursor-pointer text-uppercase text-small text-green-saturated-hover",
          { "text-grey-4": !active },
          { "text-green-saturated": active },
        )}
        onClick={this.onSetGrouping}
      >
        {grouping.name}
      </li>
    );
  }
}

export class GroupedSearchResultsList extends Component {
  props: {
    groupingIcon: string,
    groups: any,
    getUrlForEntity: any => void,
  };

  state = {
    highlightedItemIndex: 0,
    // `currentPages` is used as a map-like structure for storing the current pagination page for each group.
    // If a given group has no value in currentPages, then it is assumed to be in the first page (`0`).
    currentPages: {},
  };

  componentDidMount() {
    window.addEventListener("keydown", this.onKeyDown, true);
  }

  componentWillUnmount() {
    window.removeEventListener("keydown", this.onKeyDown, true);
  }

  componentWillReceiveProps() {
    this.setState({
      highlightedItemIndex: 0,
      currentPages: {},
    });
  }

  /**
   * Returns the count of currently visible entities for each result group.
   */
  getVisibleEntityCounts() {
    const { groups } = this.props;
    const { currentPages } = this.state;
    return groups.map((group, index) =>
      Math.min(
        PAGE_SIZE,
        group.entitiesInGroup.length - (currentPages[index] || 0) * PAGE_SIZE,
      ),
    );
  }

  onKeyDown = e => {
    const { highlightedItemIndex } = this.state;

    if (e.keyCode === KEYCODE_UP) {
      this.setState({
        highlightedItemIndex: Math.max(0, highlightedItemIndex - 1),
      });
      e.preventDefault();
    } else if (e.keyCode === KEYCODE_DOWN) {
      const visibleEntityCount = this.getVisibleEntityCounts().reduce(
        (a, b) => a + b,
      );
      this.setState({
        highlightedItemIndex: Math.min(
          highlightedItemIndex + 1,
          visibleEntityCount - 1,
        ),
      });
      e.preventDefault();
    }
  };

  /**
   * Returns `{ groupIndex, itemIndex }` which describes that which item in which group is currently highlighted.
   * Calculates it based on current visible entities (as pagination affects which entities are visible on given time)
   * and the current highlight index that is modified with up and down arrow keys
   */
  getHighlightPosition() {
    const { highlightedItemIndex } = this.state;
    const visibleEntityCounts = this.getVisibleEntityCounts();

    let entitiesInPreviousGroups = 0;
    for (
      let groupIndex = 0;
      groupIndex < visibleEntityCounts.length;
      groupIndex++
    ) {
      const visibleEntityCount = visibleEntityCounts[groupIndex];
      const indexInCurrentGroup =
        highlightedItemIndex - entitiesInPreviousGroups;

      if (indexInCurrentGroup <= visibleEntityCount - 1) {
        return { groupIndex, itemIndex: indexInCurrentGroup };
      }

      entitiesInPreviousGroups += visibleEntityCount;
    }
  }

  /**
   * Sets the current pagination page by finding the group that match the `entities` list of entities
   */
  setCurrentPage = (entities, page) => {
    const { groups } = this.props;
    const { currentPages } = this.state;
    const groupIndex = groups.findIndex(
      group => group.entitiesInGroup === entities,
    );

    this.setState({
      highlightedItemIndex: 0,
      currentPages: {
        ...currentPages,
        [groupIndex]: page,
      },
    });
  };

  render() {
    const { groupingIcon, groups, getUrlForEntity } = this.props;
    const { currentPages } = this.state;

    const highlightPosition = this.getHighlightPosition(groups);

    return (
      <div className="full">
        {groups.map(({ groupName, entitiesInGroup }, groupIndex) => (
          <SearchResultsGroup
            key={groupIndex}
            groupName={groupName}
            groupIcon={groupingIcon}
            entities={entitiesInGroup}
            getUrlForEntity={getUrlForEntity}
            highlightItemAtIndex={
              groupIndex === highlightPosition.groupIndex
                ? highlightPosition.itemIndex
                : undefined
            }
            currentPage={currentPages[groupIndex] || 0}
            setCurrentPage={this.setCurrentPage}
          />
        ))}
      </div>
    );
  }
}

export const SearchResultsGroup = ({
  groupName,
  groupIcon,
  entities,
  getUrlForEntity,
  highlightItemAtIndex,
  currentPage,
  setCurrentPage,
}) => (
  <div>
    {groupName !== null && (
      <div className="flex align-center bg-slate-almost-extra-light bordered mt3 px3 py2">
        <Icon className="mr1" style={{ color: "#BCC5CA" }} name={groupIcon} />
        <h4>{groupName}</h4>
      </div>
    )}
    <SearchResultsList
      entities={entities}
      getUrlForEntity={getUrlForEntity}
      highlightItemAtIndex={highlightItemAtIndex}
      currentPage={currentPage}
      setCurrentPage={setCurrentPage}
    />
  </div>
);

class SearchResultsList extends Component {
  props: {
    entities: any[],
    getUrlForEntity: () => void,
    highlightItemAtIndex?: number,
    currentPage: number,
    setCurrentPage: (entities, number) => void,
  };

  state = {
    page: 0,
  };

  getPaginationSection = (start, end, entityCount) => {
    const { entities, currentPage, setCurrentPage } = this.props;

    const currentEntitiesText =
      start === end ? `${start + 1}` : `${start + 1}-${end + 1}`;
    const isInBeginning = start === 0;
    const isInEnd = end + 1 >= entityCount;

    return (
      <li className="py1 px3 flex justify-end align-center">
        <span className="text-bold">{currentEntitiesText}</span>&nbsp;{t`of`}&nbsp;<span className="text-bold">
          {entityCount}
        </span>
        <span
          className={cx(
            "mx1 flex align-center justify-center rounded",
            { "cursor-pointer bg-grey-2 text-white": !isInBeginning },
            { "bg-grey-0 text-grey-1": isInBeginning },
          )}
          style={{ width: "22px", height: "22px" }}
          onClick={() =>
            !isInBeginning && setCurrentPage(entities, currentPage - 1)
          }
        >
          <Icon name="chevronleft" size={14} />
        </span>
        <span
          className={cx(
            "flex align-center justify-center rounded",
            { "cursor-pointer bg-grey-2 text-white": !isInEnd },
            { "bg-grey-0 text-grey-2": isInEnd },
          )}
          style={{ width: "22px", height: "22px" }}
          onClick={() => !isInEnd && setCurrentPage(entities, currentPage + 1)}
        >
          <Icon name="chevronright" size={14} />
        </span>
      </li>
    );
  };
  render() {
    const {
      currentPage,
      entities,
      getUrlForEntity,
      highlightItemAtIndex,
    } = this.props;

    const showPagination = PAGE_SIZE < entities.length;

    let start = PAGE_SIZE * currentPage;
    let end = Math.min(entities.length - 1, PAGE_SIZE * (currentPage + 1) - 1);
    const entityCount = entities.length;

    const entitiesInCurrentPage = entities.slice(start, end + 1);

    return (
      <ol className="Entity-search-results-list flex-full bg-white border-left border-right border-bottom rounded-bottom">
        {entitiesInCurrentPage.map((entity, index) => (
          <SearchResultListItem
            key={index}
            entity={entity}
            getUrlForEntity={getUrlForEntity}
            highlight={highlightItemAtIndex === index}
          />
        ))}
        {showPagination && this.getPaginationSection(start, end, entityCount)}
      </ol>
    );
  }
}

@connect(null, { onChangeLocation: push })
export class SearchResultListItem extends Component {
  props: {
    entity: any,
    getUrlForEntity: any => void,
    highlight?: boolean,

    onChangeLocation: string => void,
  };

  componentDidMount() {
    window.addEventListener("keydown", this.onKeyDown, true);
  }
  componentWillUnmount() {
    window.removeEventListener("keydown", this.onKeyDown, true);
  }
  /**
   * If the current search result entity is highlighted via arrow keys, then we want to
   * let the press of Enter to navigate to that entity
   */
  onKeyDown = e => {
    const { highlight, entity, getUrlForEntity, onChangeLocation } = this.props;
    if (highlight && e.keyCode === KEYCODE_ENTER) {
      onChangeLocation(getUrlForEntity(entity));
    }
  };

  render() {
    const { entity, highlight, getUrlForEntity } = this.props;

    return (
      <li>
        <Link
          className={cx(
            "no-decoration flex py2 px3 cursor-pointer bg-slate-extra-light-hover border-bottom",
            { "bg-grey-0": highlight },
          )}
          to={getUrlForEntity(entity)}
        >
          <h4 className="text-brand flex-full mr1"> {entity.name} </h4>
        </Link>
      </li>
    );
  }
}
