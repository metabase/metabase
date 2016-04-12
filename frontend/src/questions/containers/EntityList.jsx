import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import S from "../components/List.css";

import List from "../components/List.jsx";
import SearchHeader from "../components/SearchHeader.jsx";
import ActionHeader from "../components/ActionHeader.jsx";

import * as questionsActions from "../questions";
import { getSearchText, getEntityType, getEntityIds, getSectionName, getSelectedCount, getVisibleCount } from "../selectors";

const mapStateToProps = (state, props) => {
  return {
      entityType:       getEntityType(state),
      entityIds:        getEntityIds(state),

      searchText:       getSearchText(state),

      name:             getSectionName(state),
      selectedCount:    getSelectedCount(state),
      visibleCount:     getVisibleCount(state)
  }
}

@connect(mapStateToProps, questionsActions)
export default class EntityList extends Component {
    render() {
        const { style, name, selectedCount, visibleCount, searchText, setSearchText, entityType, entityIds, setItemSelected, setAllSelected } = this.props;
        return (
            <div style={style} className={S.list}>
                <div className={S.header}>
                    {name}
                </div>
                { selectedCount > 0 ?
                    <ActionHeader
                        selectedCount={selectedCount}
                        allSelected={selectedCount === visibleCount && visibleCount > 0}
                        setAllSelected={setAllSelected}
                    />
                :
                    <SearchHeader searchText={searchText} setSearchText={setSearchText} />
                }
                <List entityType={entityType} entityIds={entityIds} setItemSelected={setItemSelected} />
            </div>
        );
    }
}
