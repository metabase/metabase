import React, { Component } from "react";
import { connect } from "react-redux";
import { t } from "c-3po";

import { Box, Flex } from "rebass";

import HeaderWithBack from "metabase/components/HeaderWithBack";
import Card from "metabase/components/Card";
import ArchivedItem from "../../components/ArchivedItem";

import { withBackground } from "metabase/hoc/Background";
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
@withBackground("bg-slate-extra-light")
export default class ArchiveApp extends Component {
  render() {
    const { isAdmin, list, reload } = this.props;
    return (
      <Box mx={4}>
        <Flex align="center" mb={2} py={3}>
          <HeaderWithBack name={t`Archive`} />
        </Flex>
        <Box w={2 / 3}>
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
              />
            ))}
          </Card>
        </Box>
      </Box>
    );
  }
}
