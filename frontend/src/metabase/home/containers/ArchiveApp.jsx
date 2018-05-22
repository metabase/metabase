import React, { Component } from "react";
import { connect } from "react-redux";
import { t } from "c-3po";

import HeaderWithBack from "metabase/components/HeaderWithBack";
import SearchHeader from "metabase/components/SearchHeader";
import ArchivedItem from "../../components/ArchivedItem";

import { entityListLoader } from "metabase/entities/containers/EntityListLoader";
import listSearch from "metabase/hoc/ListSearch";

import { getUserIsAdmin } from "metabase/selectors/user";

const mapStateToProps = (state, props) => ({
  isAdmin: getUserIsAdmin(state, props),
});

@entityListLoader({
  entityType: "search",
  entityQuery: { archived: true },
  reload: true,
  wrapped: true,
})
@listSearch()
@connect(mapStateToProps, null)
export default class ArchiveApp extends Component {
  render() {
    const { isAdmin, list, reload, searchText, onSetSearchText } = this.props;
    return (
      <div className="px4 pt3">
        <div className="flex align-center mb2">
          <HeaderWithBack name={t`Archive`} />
        </div>
        <SearchHeader searchText={searchText} setSearchText={onSetSearchText} />
        {list.map(item => (
          <ArchivedItem
            key={item.type + item.id}
            type={item.type}
            name={item.getName()}
            icon={item.getIcon()}
            color={item.getColor()}
            isAdmin={isAdmin}
            onUnarchive={
              item.setArchived
                ? async () => {
                    await item.setArchived(false);
                    reload();
                  }
                : null
            }
          />
        ))}
      </div>
    );
  }
}
