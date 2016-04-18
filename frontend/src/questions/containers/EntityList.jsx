/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import S from "../components/List.css";

import List from "../components/List.jsx";
import SearchHeader from "../components/SearchHeader.jsx";
import ActionHeader from "../components/ActionHeader.jsx";
import UndoListing from "./UndoListing.jsx";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import { setSearchText, setItemSelected, setAllSelected, setArchived } from "../questions";
import {
    getEntityType, getEntityIds,
    getSectionName, getSectionLoading, getSectionError,
    getSearchText,
    getVisibleCount, getSelectedCount, getAllAreSelected, getSectionIsArchive,
    getLabelsWithSelectedState
} from "../selectors";

const mapStateToProps = (state, props) => {
  return {
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

    render() {
        const {
            style,
            name, loading, error,
            entityType, entityIds,
            searchText, setSearchText,
            visibleCount, selectedCount, allAreSelected, sectionIsArchive, labels,
            setItemSelected, setAllSelected, setArchived
        } = this.props;
        return (
            <div style={style} className={S.list}>
                <div className={S.header}>
                    {name}
                </div>
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
                <LoadingAndErrorWrapper loading={!error && loading} error={error}>
                { () =>
                    <List entityType={entityType} entityIds={entityIds} setItemSelected={setItemSelected} />
                }
                </LoadingAndErrorWrapper>
                <UndoListing />
            </div>
        );
    }
}
