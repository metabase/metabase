import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import S from "../components/List.css";

import List from "../components/List.jsx";
import SearchHeader from "../components/SearchHeader.jsx";
import ActionHeader from "../components/ActionHeader.jsx";
import UndoListing from "./UndoListing.jsx";

import { setSearchText, setItemSelected, setAllSelected, setArchived } from "../questions";
import { getSearchText, getEntityType, getEntityIds, getSectionName, getVisibleCount, getSelectedCount, getAllAreSelected, getSectionIsArchive, getLabelsWithSelectedState } from "../selectors";

const mapStateToProps = (state, props) => {
  return {
      entityType:       getEntityType(state),
      entityIds:        getEntityIds(state),

      searchText:       getSearchText(state),

      name:             getSectionName(state),
      visibleCount:     getVisibleCount(state),
      selectedCount:    getSelectedCount(state),
      allAreSelected:   getAllAreSelected(state),
      sectionIsArchive:        getSectionIsArchive(state),

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
    render() {
        const { style, name, visibleCount, selectedCount, allAreSelected, sectionIsArchive, labels, searchText, setSearchText, entityType, entityIds, setItemSelected, setAllSelected, setArchived } = this.props;
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
                <List entityType={entityType} entityIds={entityIds} setItemSelected={setItemSelected} />
                <UndoListing />
            </div>
        );
    }
}
