import React, { Component } from "react";
import { connect } from "react-redux";
import { t } from "c-3po";

import HeaderWithBack from "metabase/components/HeaderWithBack";
import SearchHeader from "metabase/components/SearchHeader";
import ArchivedItem from "../../components/ArchivedItem";

import { loadEntities, setArchived, setSearchText } from "../questions";
import { setCollectionArchived } from "../collections";
import { getVisibleEntities, getSearchText } from "../selectors";
import { getUserIsAdmin } from "metabase/selectors/user";

import visualizations from "metabase/visualizations";

const mapStateToProps = (state, props) => ({
  searchText: getSearchText(state, props),
  archivedCards:
    getVisibleEntities(state, {
      entityType: "cards",
      entityQuery: { f: "archived" },
    }) || [],
  archivedCollections:
    getVisibleEntities(state, {
      entityType: "collections",
      entityQuery: { archived: true },
    }) || [],

  isAdmin: getUserIsAdmin(state, props),
});

const mapDispatchToProps = {
  loadEntities,
  setSearchText,
  setArchived,
  setCollectionArchived,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class Archive extends Component {
  componentWillMount() {
    this.loadEntities();
  }
  loadEntities() {
    this.props.loadEntities("cards", { f: "archived" });
    this.props.loadEntities("collections", { archived: true });
  }
  render() {
    const { archivedCards, archivedCollections, isAdmin } = this.props;
    const items = [
      ...archivedCollections.map(collection => ({
        type: "collection",
        ...collection,
      })),
      ...archivedCards.map(card => ({ type: "card", ...card })),
    ]; //.sort((a,b) => a.updated_at.valueOf() - b.updated_at.valueOf()))

    return (
      <div className="px4 pt3">
        <div className="flex align-center mb2">
          <HeaderWithBack name={t`Archive`} />
        </div>
        <SearchHeader
          searchText={this.props.searchText}
          setSearchText={this.props.setSearchText}
        />
        <div>
          {items.map(
            item =>
              item.type === "collection" ? (
                <ArchivedItem
                  key={item.type + item.id}
                  name={item.name}
                  type="collection"
                  icon="collection"
                  color={item.color}
                  isAdmin={isAdmin}
                  onUnarchive={async () => {
                    await this.props.setCollectionArchived(item.id, false);
                    this.loadEntities();
                  }}
                />
              ) : item.type === "card" ? (
                <ArchivedItem
                  key={item.type + item.id}
                  name={item.name}
                  type="card"
                  icon={visualizations.get(item.display).iconName}
                  isAdmin={isAdmin}
                  onUnarchive={async () => {
                    await this.props.setArchived(item.id, false, true);
                    this.loadEntities();
                  }}
                />
              ) : null,
          )}
        </div>
      </div>
    );
  }
}
