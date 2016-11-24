/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";

import S from "../components/List.css";

import List from "../components/List.jsx";
import SearchHeader from "../components/SearchHeader.jsx";
import ActionHeader from "../components/ActionHeader.jsx";
import EmptyState from "metabase/components/EmptyState.jsx";
import UndoListing from "./UndoListing.jsx";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import { setSearchText, setItemSelected, setAllSelected, setArchived } from "../questions";
import {
    getSection, getEntityType, getEntityIds,
    getSectionName, getSectionLoading, getSectionError,
    getSearchText,
    getVisibleCount, getSelectedCount, getAllAreSelected, getSectionIsArchive,
    getLabelsWithSelectedState
} from "../selectors";

const mapStateToProps = (state, props) => {
  return {
      sectionId:        getSection(state),
      entityType:       getEntityType(state),
      entityIds:        getEntityIds(state),
      loading:          getSectionLoading(state),
      error:            getSectionError(state),

      searchText:       getSearchText(state),

      name:             getSectionName(state),
      visibleCount:     getVisibleCount(state),
      selectedCount:    getSelectedCount(state),
      allAreSelected:   getAllAreSelected(state),
      sectionIsArchive: getSectionIsArchive(state),

      labels:           getLabelsWithSelectedState(state)
  }
}

const mapDispatchToProps = {
    setItemSelected,
    setAllSelected,
    setSearchText,
    setArchived
}

@connect(mapStateToProps, mapDispatchToProps)
export default class EntityList extends Component {
    static propTypes = {
        style:              PropTypes.object.isRequired,
        sectionId:          PropTypes.string.isRequired,
        name:               PropTypes.string.isRequired,
        loading:            PropTypes.bool.isRequired,
        error:              PropTypes.any,
        entityType:         PropTypes.string.isRequired,
        entityIds:          PropTypes.array.isRequired,
        searchText:         PropTypes.string.isRequired,
        setSearchText:      PropTypes.func.isRequired,
        visibleCount:       PropTypes.number.isRequired,
        selectedCount:      PropTypes.number.isRequired,
        allAreSelected:     PropTypes.bool.isRequired,
        sectionIsArchive:   PropTypes.bool.isRequired,
        labels:             PropTypes.array.isRequired,
        setItemSelected:    PropTypes.func.isRequired,
        setAllSelected:     PropTypes.func.isRequired,
        setArchived:        PropTypes.func.isRequired
    };

    componentDidUpdate(prevProps) {
        // Scroll to the top of the list if the section changed
        // A little hacky, something like https://github.com/taion/scroll-behavior might be better
        if (this.props.sectionId !== prevProps.sectionId) {
            ReactDOM.findDOMNode(this).scrollTop = 0;
        }
    }

    emptyState () {
      switch (this.props.name) {
        case 'All questions':
          return {
            icon: 'all',
            message: 'No questions have been saved yet.'
          }
        case 'Recently viewed':
          return {
            icon: 'recents',
            message: 'You haven\'t viewed any questions recently.'
          }
        case 'Saved by me':
          return {
            icon: 'mine',
            message: 'You haven\'t saved any questions yet.'
          }
        case 'Favorites':
          return {
            icon: 'star',
            message: 'You haven\'t favorited any questions yet.'
          }
        case 'Most popular':
          return {
            icon: 'popular' ,
            message: 'The most viewed questions across your company will show up here.'
          }
        case 'Archive':
          return {
            icon: 'archive',
            message: 'If you no longer need a question, you can archive it.'
          }
        default:
          return {
            icon: 'label',
            message: 'There aren\'t any questions with this label.'
          }
      }
    }

    render() {
        const {
            style,
            name, loading, error,
            entityType, entityIds,
            searchText, setSearchText,
            visibleCount, selectedCount, allAreSelected, sectionIsArchive, labels,
            setItemSelected, setAllSelected, setArchived
        } = this.props;
        const empty = this.emptyState();
        return (
            <div className="full">
                  <div>
                      <h2>{name}</h2>
                  </div>
                  <LoadingAndErrorWrapper loading={!error && loading} error={error}>
                  { () =>
                        entityIds.length > 0 ? (
                          <div>
                            <div className="flex align-center my1" style={{height: 40}}>
                              { selectedCount > 0 ?
                                <ActionHeader
                                  visibleCount={visibleCount}
                                  selectedCount={selectedCount}
                                  allAreSelected={allAreSelected}
                                  sectionIsArchive={sectionIsArchive}
                                  setAllSelected={setAllSelected}
                                  setArchived={setArchived}
                                  labels={labels}
                                  />
                                :
                                <SearchHeader searchText={searchText} setSearchText={setSearchText} />
                              }
                            </div>
                            <List
                                entityType={entityType}
                                entityIds={entityIds}
                                setItemSelected={setItemSelected}
                            />
                          </div>
                        ) : (
                          <div className={S.empty}>
                            <EmptyState message={empty.message} icon={empty.icon} />
                          </div>
                        )
                  }
                  </LoadingAndErrorWrapper>
                <UndoListing />

            </div>
        );
    }
}
