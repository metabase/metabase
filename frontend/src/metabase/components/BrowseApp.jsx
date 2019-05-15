import React from "react";
import { Box, Flex } from "grid-styled";
import { t } from "ttag";
import BrowserCrumbs from "metabase/components/BrowserCrumbs";
import { connect } from "react-redux";

import Database from "metabase/entities/databases";
import Schema from "metabase/entities/schemas";
import Table from "metabase/entities/tables";

import EntityItem from "metabase/components/EntityItem";

import { normal } from "metabase/lib/colors";

import { getXraysEnabled } from "metabase/selectors/settings";
import { getMetadata } from "metabase/selectors/metadata";

import Card from "metabase/components/Card";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon, { IconWrapper } from "metabase/components/Icon";
import Link from "metabase/components/Link";
import Subhead from "metabase/components/Subhead";
import Tooltip from "metabase/components/Tooltip";

const PAGE_PADDING = [1, 2, 4];
const ITEM_WIDTHS = [1, 1 / 2, 1 / 3];
const ANALYTICS_CONTEXT = "Data Browse";

export class SchemaBrowser extends React.Component {
  render() {
    const { dbId } = this.props.params;
    return (
      <Box>
        <Schema.ListLoader query={{ dbId }}>
          {({ schemas }) =>
            schemas.length > 1 ? (
              <Box>
                <BrowseHeader
                  crumbs={[
                    { title: t`Our data`, to: "browse" },
                    { title: <Database.Name id={dbId} /> },
                  ]}
                />
                <Grid>
                  {schemas.map(schema => (
                    <GridItem w={ITEM_WIDTHS} key={schema.id}>
                      <Link
                        to={`/browse/${dbId}/schema/${schema.name}`}
                        mb={1}
                        hover={{ color: normal.purple }}
                        data-metabase-event={`${ANALYTICS_CONTEXT};Schema Click`}
                        className="overflow-hidden"
                      >
                        <Card hoverable px={1}>
                          <Flex align="center">
                            <EntityItem
                              name={schema.name}
                              iconName="folder"
                              iconColor={normal.purple}
                              item={schema}
                            />
                            <Box ml="auto">
                              <Icon name="reference" />
                              <Tooltip tooltip={t`X-ray this schema`}>
                                <Icon name="bolt" mx={1} />
                              </Tooltip>
                            </Box>
                          </Flex>
                        </Card>
                      </Link>
                    </GridItem>
                  ))}
                </Grid>
              </Box>
            ) : (
              <TableBrowser {...this.props} />
            )
          }
        </Schema.ListLoader>
      </Box>
    );
  }
}

@connect(state => ({
  metadata: getMetadata(state),
  xraysEnabled: getXraysEnabled(state),
}))
export class TableBrowser extends React.Component {
  render() {
    const {
      metadata,
      params: { dbId, schemaName },
    } = this.props;
    return (
      <Box>
        <Table.ListLoader query={{ dbId, schemaName }}>
          {({ tables, loading, error }) => {
            return (
              <Box>
                <BrowseHeader
                  crumbs={[
                    { title: t`Our data`, to: "browse" },
                    {
                      title: <Database.Name id={dbId} />,
                      to: `browse/${dbId}`,
                    },
                    schemaName != null && { title: schemaName },
                  ]}
                />
                <Grid>
                  {tables.map(table => {
                    // NOTE: currently tables entities doesn't integrate with Metadata objects
                    const metadataTable = metadata.table(table.id);
                    const link =
                      metadataTable && metadataTable.newQuestion().getUrl();
                    return (
                      <GridItem w={ITEM_WIDTHS} key={table.id}>
                        <Card
                          hoverable
                          px={1}
                          className="hover-parent hover--visibility"
                        >
                          <Flex align="center">
                            <Link
                              to={link}
                              ml={1}
                              hover={{ color: normal.purple }}
                              data-metabase-event={`${ANALYTICS_CONTEXT};Table Click`}
                              className="overflow-hidden"
                            >
                              <EntityItem
                                item={table}
                                name={table.display_name || table.name}
                                iconName="table"
                                iconColor={normal.purple}
                              />
                            </Link>
                            <Box ml="auto" mr={1} className="hover-child">
                              <Flex align="center">
                                {this.props.xraysEnabled && (
                                  <Tooltip tooltip={t`X-ray this table`}>
                                    <Link
                                      to={`auto/dashboard/table/${table.id}`}
                                      data-metabase-event={`${ANALYTICS_CONTEXT};Table Item;X-ray Click`}
                                    >
                                      <Icon
                                        name="bolt"
                                        mx={1}
                                        color={normal.yellow}
                                        size={20}
                                      />
                                    </Link>
                                  </Tooltip>
                                )}
                                <Tooltip tooltip={t`Learn about this table`}>
                                  <Link
                                    to={`reference/databases/${dbId}/tables/${
                                      table.id
                                    }`}
                                    data-metabase-event={`${ANALYTICS_CONTEXT};Table Item;Reference Click`}
                                  >
                                    <Icon
                                      name="reference"
                                      color={normal.grey1}
                                    />
                                  </Link>
                                </Tooltip>
                              </Flex>
                            </Box>
                          </Flex>
                        </Card>
                      </GridItem>
                    );
                  })}
                </Grid>
              </Box>
            );
          }}
        </Table.ListLoader>
      </Box>
    );
  }
}

export class BrowseApp extends React.Component {
  render() {
    return <Box mx={PAGE_PADDING}>{this.props.children}</Box>;
  }
}

export class DatabaseBrowser extends React.Component {
  render() {
    return (
      <Box>
        <BrowseHeader crumbs={[{ title: t`Our data` }]} />

        <Database.ListLoader>
          {({ databases, loading, error }) => {
            return (
              <Grid>
                {databases.map(database => (
                  <GridItem w={ITEM_WIDTHS} key={database.id}>
                    <Link
                      to={`browse/${database.id}`}
                      data-metabase-event={`${ANALYTICS_CONTEXT};Database Click`}
                      hover={{ color: normal.blue }}
                    >
                      <Card p={3}>
                        <Icon
                          name="database"
                          color={normal.purple}
                          mb={3}
                          size={28}
                        />
                        <h3>{database.name}</h3>
                      </Card>
                    </Link>
                  </GridItem>
                ))}
              </Grid>
            );
          }}
        </Database.ListLoader>
      </Box>
    );
  }
}

function BrowseHeader({ crumbs }) {
  return (
    <Box mt={3} mb={2} className="flex align-center">
      <BrowserCrumbs crumbs={crumbs} analyticsContext={ANALYTICS_CONTEXT} />
      <div className="flex flex-align-right">
        <Link
          className="flex flex-align-right"
          to="reference"
          data-metabase-event={`NavBar;Reference`}
        >
          <div className="flex flex-align-center text-medium text-brand-hover">
            <Icon className="flex flex-align-center" size={18} name="reference" />
            <h3 className="ml1 flex flex-align-center">Learn about our data</h3>
          </div>
        </Link>
      </div>
    </Box>
  );
}
