import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import { Box } from "grid-styled";

import { getXraysEnabled } from "metabase/selectors/settings";
import { getMetadata } from "metabase/selectors/metadata";

import Table from "metabase/entities/tables";

import { color } from "metabase/lib/colors";

import Card from "metabase/components/Card";
import Database from "metabase/entities/databases";
import EntityItem from "metabase/components/EntityItem";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import BrowseHeader from "metabase/browse/components/BrowseHeader";
import { ANALYTICS_CONTEXT, ITEM_WIDTHS } from "metabase/browse/constants";

function TableBrowser(props) {
  const {
    tables,
    metadata,
    params: { dbId, schemaName },
    showSchemaInHeader = true,
  } = props;
  return (
    <Box>
      <BrowseHeader
        crumbs={[
          { title: t`Our data`, to: "browse" },
          {
            title: <Database.Name id={dbId} />,
            to: `browse/${dbId}`,
          },
          showSchemaInHeader && { title: schemaName },
        ]}
      />
      <Grid>
        {tables.map(table => {
          // NOTE: currently tables entities doesn't integrate with Metadata objects
          const metadataTable = metadata.table(table.id);
          const link =
            metadataTable &&
            // NOTE: don't clean since we might not have all the metadata loaded?
            metadataTable.newQuestion().getUrl({ clean: false });
          return (
            <GridItem w={ITEM_WIDTHS} key={table.id}>
              <Card hoverable px={1} className="hover-parent hover--visibility">
                <Link
                  to={link}
                  ml={1}
                  hover={{ color: color("accent2") }}
                  data-metabase-event={`${ANALYTICS_CONTEXT};Table Click`}
                  className="block overflow-hidden"
                >
                  <EntityItem
                    item={table}
                    name={table.display_name || table.name}
                    iconName="table"
                    iconColor={color("accent2")}
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
                </Link>
              </Card>
            </GridItem>
          );
        })}
      </Grid>
    </Box>
  );
}

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
