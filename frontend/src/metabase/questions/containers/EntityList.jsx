/* @flow weak */
/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";
import { connect } from "react-redux";
import { t } from "c-3po";
import EmptyState from "metabase/components/EmptyState";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import ListFilterWidget from "metabase/components/ListFilterWidget";

import S from "../components/List.css";

import List from "../components/List";
import SearchHeader from "metabase/components/SearchHeader";
import ActionHeader from "../components/ActionHeader";

import _ from "underscore";

import {
  loadEntities,
  setSearchText,
  setItemSelected,
  setAllSelected,
  setArchived,
  setFavorited,
} from "../questions";
import { loadLabels } from "../labels";
import {
  getVisibleItems,
  getSectionLoading,
  getSectionError,
  getSearchText,
  getVisibleCount,
  getSelectedCount,
  getAllAreSelected,
  getSectionIsArchive,
  getLabelsWithSelectedState,
} from "../selectors";

const mapStateToProps = (state, props) => {
  return {
    items: getVisibleItems(state, props),
    loading: getSectionLoading(state, props),
    error: getSectionError(state, props),

    searchText: getSearchText(state, props),

    visibleCount: getVisibleCount(state, props),
    selectedCount: getSelectedCount(state, props),
    allAreSelected: getAllAreSelected(state, props),
    sectionIsArchive: getSectionIsArchive(state, props),

    labels: getLabelsWithSelectedState(state, props),
  };
};

const mapDispatchToProps = {
  setSearchText,
  setAllSelected,
  setItemSelected,
  setArchived,
  setFavorited,

  loadEntities,
  loadLabels,
};

const SECTIONS = [
  {
    id: "all",
    name: t`All questions`,
    icon: "all",
    empty: t`No questions have been saved yet.`,
  },
  {
    id: "fav",
    name: t`Favorites`,
    icon: "star",
    empty: t`You haven't favorited any questions yet.`,
  },
  {
    id: "recent",
    name: t`Recently viewed`,
    icon: "recents",
    empty: t`You haven't viewed any questions recently.`,
  },
  {
    id: "mine",
    name: t`Saved by me`,
    icon: "mine",
    empty: t`You haven't saved any questions yet.`,
  },
  {
    id: "popular",
    name: t`Most popular`,
    icon: "popular",
    empty: t`The most-viewed questions across your company will show up here.`,
  },
  {
    id: "archived",
    name: t`Archive`,
    icon: "archive",
    empty: t`If you no longer need a question, you can archive it.`,
  },
];

const DEFAULT_SECTION = {
  icon: "all",
  empty: t`There aren't any questions matching that criteria.`,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class EntityList extends Component {
  static propTypes = {
    style: PropTypes.object,

    entityQuery: PropTypes.object.isRequired,
    entityType: PropTypes.string.isRequired,

    section: PropTypes.string,
    items: PropTypes.array.isRequired,
    loading: PropTypes.bool.isRequired,
    error: PropTypes.any,
    searchText: PropTypes.string.isRequired,
    setSearchText: PropTypes.func.isRequired,
    visibleCount: PropTypes.number.isRequired,
    selectedCount: PropTypes.number.isRequired,
    allAreSelected: PropTypes.bool.isRequired,
    sectionIsArchive: PropTypes.bool.isRequired,
    labels: PropTypes.array.isRequired,
    setItemSelected: PropTypes.func.isRequired,
    setAllSelected: PropTypes.func.isRequired,
    setArchived: PropTypes.func.isRequired,
    setFavorited: PropTypes.func.isRequired,

    loadEntities: PropTypes.func.isRequired,
    loadLabels: PropTypes.func.isRequired,

    onEntityClick: PropTypes.func,
    onChangeSection: PropTypes.func,
    showSearchWidget: PropTypes.bool.isRequired,
    showCollectionName: PropTypes.bool.isRequired,
    editable: PropTypes.bool.isRequired,

    defaultEmptyState: PropTypes.string,
  };

  static defaultProps = {
    showSearchWidget: true,
    showCollectionName: true,
    editable: true,
  };

  componentDidUpdate(prevProps) {
    // Scroll to the top of the list if the section changed
    // A little hacky, something like https://github.com/taion/scroll-behavior might be better
    if (!_.isEqual(this.props.entityQuery, prevProps.entityQuery)) {
      ReactDOM.findDOMNode(this).scrollTop = 0;
    }
  }

  componentWillMount() {
    this.props.loadLabels();
    this.props.loadEntities(this.props.entityType, this.props.entityQuery);
  }
  componentWillReceiveProps(nextProps) {
    if (
      !_.isEqual(this.props.entityQuery, nextProps.entityQuery) ||
      nextProps.entityType !== this.props.entityType
    ) {
      this.props.loadEntities(nextProps.entityType, nextProps.entityQuery);
    }
  }

  getSection() {
    return (
      _.findWhere(SECTIONS, {
        id: (this.props.entityQuery && this.props.entityQuery.f) || "all",
      }) || DEFAULT_SECTION
    );
  }

  render() {
    const {
      style,
      loading,
      error,
      entityType,
      items,
      searchText,
      setSearchText,
      showSearchWidget,
      visibleCount,
      selectedCount,
      allAreSelected,
      sectionIsArchive,
      labels,
      setItemSelected,
      setAllSelected,
      setArchived,
      setFavorited,
      onChangeSection,
      showCollectionName,
      editable,
      onEntityClick,
    } = this.props;

    const section = this.getSection();

    const hasEntitiesInPlainState =
      items.length > 0 || section.section !== "all";

    const showActionHeader = editable && selectedCount > 0;
    const showSearchHeader = hasEntitiesInPlainState && showSearchWidget;
    const showEntityFilterWidget = onChangeSection;

    return (
      <div style={style}>
        {(showActionHeader || showSearchHeader || showEntityFilterWidget) && (
          <div className="flex align-center my1" style={{ height: 40 }}>
            {showActionHeader ? (
              <ActionHeader
                visibleCount={visibleCount}
                selectedCount={selectedCount}
                allAreSelected={allAreSelected}
                sectionIsArchive={sectionIsArchive}
                setAllSelected={setAllSelected}
                setArchived={setArchived}
                labels={labels}
              />
            ) : showSearchHeader ? (
              <div style={{ marginLeft: "10px" }}>
                <SearchHeader
                  searchText={searchText}
                  setSearchText={setSearchText}
                />
              </div>
            ) : null}
            {showEntityFilterWidget &&
              hasEntitiesInPlainState && (
                <ListFilterWidget
                  items={SECTIONS.filter(item => item.id !== "archived")}
                  activeItem={section}
                  onChange={item => onChangeSection(item.id)}
                />
              )}
          </div>
        )}
        <LoadingAndErrorWrapper
          className="full"
          loading={!error && loading}
          error={error}
        >
          {() =>
            items.length > 0 ? (
              <List
                items={items}
                entityType={entityType}
                editable={editable}
                setItemSelected={setItemSelected}
                setArchived={setArchived}
                setFavorited={setFavorited}
                onEntityClick={onEntityClick}
                showCollectionName={showCollectionName}
              />
            ) : (
              <div className={S.empty}>
                <EmptyState
                  message={
                    section.id === "all" && this.props.defaultEmptyState
                      ? this.props.defaultEmptyState
                      : section.empty
                  }
                  icon={section.icon}
                />
              </div>
            )
          }
        </LoadingAndErrorWrapper>
      </div>
    );
  }
}
