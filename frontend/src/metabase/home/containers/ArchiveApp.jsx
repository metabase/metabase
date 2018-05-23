import React, { Component } from "react";
import { connect } from "react-redux";
import { t } from "c-3po";

import { Box, Flex } from "rebass";

import HeaderWithBack from "metabase/components/HeaderWithBack";
import Card from "metabase/components/Card";
import ArchivedItem from "../../components/ArchivedItem";
import Icon from "metabase/components/Icon";

import StackedCheckBox from "metabase/components/StackedCheckBox";

import { entityListLoader } from "metabase/entities/containers/EntityListLoader";
import listSearch from "metabase/hoc/ListSearch";
import listSelect from "metabase/hoc/ListSelect";

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
@listSelect()
@connect(mapStateToProps, null)
export default class ArchiveApp extends Component {
  render() {
    const {
      isAdmin,
      list,
      reload,
      searchText,
      onSetSearchText,

      selected,
      selection,
      onToggleSelected,
    } = this.props;
    return (
      <Box mx={4}>
        <Flex align="center" mb={2} py={3}>
          <HeaderWithBack name={t`Archive`} />
        </Flex>
        <SearchHeader searchText={searchText} setSearchText={onSetSearchText} />
        {list.length > 0 && (
          <div className="flex align-center p2">
            <SelectionControls {...this.props} />
            <BulkActionControls {...this.props} />
          </div>
        )}
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
            selected={selection.has(item)}
            onToggleSelected={() => onToggleSelected(item)}
          />
        ))}
      </Box>
    );
  }
}

const BulkActionControls = ({ selected, reload }) => (
  <span className="ml-auto">
    {selected.length > 0 && (
      <Icon
        name="unarchive"
        className="cursor-pointer text-brand-hover"
        onClick={async () => {
          try {
            await Promise.all(selected.map(item => item.setArchived(false)));
          } finally {
            reload();
          }
        }}
      />
    )}
  </span>
);

const SelectionControls = ({
  selected,
  deselected,
  onSelectAll,
  onSelectNone,
}) =>
  deselected.length === 0 ? (
    <span className="flex align-center">
      <StackedCheckBox checked={true} onChange={onSelectNone} />
      <div className="ml1">Select None</div>
    </span>
  ) : (
    <span className="flex align-center">
      <StackedCheckBox checked={false} onChange={onSelectAll} />
      <div className="ml1">Select All</div>
    </span>
  );
