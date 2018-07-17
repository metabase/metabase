import React, { Component } from "react";
import { connect } from "react-redux";
import { t } from "c-3po";

import { Box, Flex } from "grid-styled";

import ArchivedItem from "../../components/ArchivedItem";
import Button from "metabase/components/Button";
import BulkActionBar from "metabase/components/BulkActionBar";
import Card from "metabase/components/Card";
import PageHeading from "metabase/components/PageHeading";
import StackedCheckBox from "metabase/components/StackedCheckBox";
import VirtualizedList from "metabase/components/VirtualizedList";

import { entityListLoader } from "metabase/entities/containers/EntityListLoader";
import listSelect from "metabase/hoc/ListSelect";

import { getUserIsAdmin } from "metabase/selectors/user";

const mapStateToProps = (state, props) => ({
  isAdmin: getUserIsAdmin(state, props),
});

const ROW_HEIGHT = 68;

@entityListLoader({
  entityType: "search",
  entityQuery: { archived: true },
  reload: true,
  wrapped: true,
})
@listSelect({ keyForItem: item => `${item.model}:${item.id}` })
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
        <Box mt={2} py={2}>
          <PageHeading>{t`Archive`}</PageHeading>
        </Box>
        <Box w={2 / 3}>
          <Card
            style={{
              height: list.length > 0 ? ROW_HEIGHT * list.length : "auto",
            }}
          >
            {list.length > 0 ? (
              <VirtualizedList
                items={list}
                rowHeight={ROW_HEIGHT}
                renderItem={({ item, index }) => (
                  <ArchivedItem
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
                    showSelect={selected.length > 0}
                  />
                )}
              />
            ) : (
              <Flex p={5} align="center" justify="center">
                <h2>{t`Items you archive will appear here.`}</h2>
              </Flex>
            )}
          </Card>
        </Box>
        <BulkActionBar showing={selected.length > 0}>
          <Flex align="center" py={2} px={4}>
            <SelectionControls {...this.props} />
            <BulkActionControls {...this.props} />
            <Box ml="auto">{t`${selected.length} items selected`}</Box>
          </Flex>
        </BulkActionBar>
      </Box>
    );
  }
}

const BulkActionControls = ({ selected, reload }) => (
  <span>
    <Button
      ml={1}
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
    <StackedCheckBox checked={true} onChange={onSelectNone} />
  ) : (
    <StackedCheckBox checked={false} onChange={onSelectAll} />
  );
