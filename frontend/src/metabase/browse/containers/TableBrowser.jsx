import React from "react";
import { connect } from "react-redux";
import { Box, Flex } from "grid-styled";

import * as Urls from "metabase/lib/urls";

import { getXraysEnabled } from "metabase/selectors/settings";
import { getMetadata } from "metabase/selectors/metadata";

import Table from "metabase/entities/tables";

import Database from "metabase/entities/databases";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import Tooltip from "metabase/components/Tooltip";

function TableBrowser(props) {
  const {
    tables,
    metadata,
    params: { dbId, schemaName },
    showSchemaInHeader = true,
  } = props;
  return (
    <Box p={4} className="border-right" bg="white" w={600}>
      <h3>
        <Database.Name id={dbId} />
      </h3>
      {tables.map(table => {
        // NOTE: currently tables entities doesn't integrate with Metadata objects
        const metadataTable = metadata.table(table.id);
        const queryLink =
          metadataTable &&
          // NOTE: don't clean since we might not have all the metadata loaded?
          metadataTable.newQuestion().getUrl({ clean: false });
        return (
          <Flex
            py={2}
            align="center"
            className="hover-parent hover--visibility border-bottom"
          >
            <Icon name="table" />
            <Link to={Urls.exploreTable(table)}>
              <h3>{table.display_name}</h3>
            </Link>

            <Tooltip tooltip={`Start a question`}>
              <Link ml="auto" to={queryLink} className="Button hover-child">
                <Icon name="insight" />
              </Link>
            </Tooltip>
          </Flex>
        );
      })}
    </Box>
  );
}

/*
          <EntityItem
            item={table}
            name={table.display_name || table.name}
            iconName="table"
            buttons={[
              props.xraysEnabled && (
                <Link
                  to={`auto/dashboard/table/${table.id}`}
                  data-metabase-event={`${ANALYTICS_CONTEXT};Table Item;X-ray Click`}
                  className="link--icon ml1"
                >
                  <Icon
                    key="xray"
                    tooltip={t`X-ray this table`}
                    name="bolt"
                    color={color("warning")}
                    size={20}
                    className="hover-child"
                  />
                </Link>
              ),
              <Link
                to={`reference/databases/${dbId}/tables/${table.id}`}
                data-metabase-event={`${ANALYTICS_CONTEXT};Table Item;Reference Click`}
                className="link--icon ml1"
              >
                <Icon
                  key="reference"
                  tooltip={t`Learn about this table`}
                  name="reference"
                  color={color("text-medium")}
                  className="hover-child"
                />
              </Link>,
            ]}
          />
          */

export default Table.loadList({
  query: (state, { params: { dbId, schemaName } }) => ({
    dbId,
    schemaName,
  }),
})(
  connect(state => ({
    metadata: getMetadata(state),
    xraysEnabled: getXraysEnabled(state),
  }))(TableBrowser),
);
