import React, { Component } from "react";
import { connect } from "react-redux";
import { t } from "c-3po";

import { Box, Flex } from "rebass";

import HeaderWithBack from "metabase/components/HeaderWithBack";
import Card from "metabase/components/Card";
import ArchivedItem from "../../components/ArchivedItem";
import Button from "metabase/components/Button";
import BulkActionBar from "metabase/components/BulkActionBar"

import StackedCheckBox from "metabase/components/StackedCheckBox";

import { entityListLoader } from "metabase/entities/containers/EntityListLoader";
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
@listSelect()
@connect(mapStateToProps, null)
export default class ArchiveApp extends Component {
  render() {
    const {
      isAdmin,
      list,
      reload,

      selected,
      selection,
      onToggleSelected,
    } = this.props;
    return (
      <Box mx={4}>
        <Flex align="center" mb={2} py={3}>
          <HeaderWithBack name={t`Archive`} />
        </Flex>
        <Box w={2/3}>
          <Card>
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
          </Card>
        </Box>
        <BulkActionBar showing={selected.length > 0 }>
          <SelectionControls {...this.props} />
          <BulkActionControls {...this.props} />
        </BulkActionBar>
      </Box>
    );
  }
}

const BulkActionControls = ({ selected, reload }) => (
  <span>
    <Button
      medium
      onClick={async () => {
        try {
          await Promise.all(selected.map(item => item.setArchived(false)));
        } finally {
          reload();
        }
      }}
    >{t`Unarchive`}</Button>
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
