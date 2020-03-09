import React from "react";
import { Box, Flex } from "grid-styled";
import { t } from "ttag";
import BrowserCrumbs from "metabase/components/BrowserCrumbs";
import { connect } from "react-redux";

import Database from "metabase/entities/databases";
import Schema from "metabase/entities/schemas";
import Table from "metabase/entities/tables";

import EntityItem from "metabase/components/EntityItem";

import { color } from "metabase/lib/colors";

import { getXraysEnabled } from "metabase/selectors/settings";
import { getMetadata } from "metabase/selectors/metadata";

import Card from "metabase/components/Card";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
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
            schemas.length === 1 ? (
              <TableBrowser
                {...this.props}
                params={{ ...this.props.params, schemaName: schemas[0].name }}
                // hide the schema since there's only one
                showSchemaInHeader={false}
              />
            ) : (
              <Box>
                <BrowseHeader
                  crumbs={[
                    { title: t`Our data`, to: "browse" },
                    { title: <Database.Name id={dbId} /> },
                  ]}
                />
                {schemas.length === 0 ? (
                  <h2 className="full text-centered text-medium">{t`This database doesn't have any tables.`}</h2>
                ) : (
                  <Grid>
                    {schemas.map(schema => (
                      <GridItem w={ITEM_WIDTHS} key={schema.id}>
                        <Link
                          to={`/browse/${dbId}/schema/${schema.name}`}
                          mb={1}
                          hover={{ color: color("accent2") }}
                          data-metabase-event={`${ANALYTICS_CONTEXT};Schema Click`}
                          className="overflow-hidden"
                        >
                          <Card hoverable px={1}>
                            <Flex align="center">
                              <EntityItem
                                name={schema.name}
                                iconName="folder"
                                iconColor={color("accent2")}
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
                )}
              </Box>
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
      showSchemaInHeader = true,
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
                        <Card
                          hoverable
                          px={1}
                          className="hover-parent hover--visibility"
                        >
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
                                this.props.xraysEnabled && (
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
                      display="block"
                      hover={{ color: color("brand") }}
                    >
                      <Card p={3} hover={{ color: color("brand") }}>
                        <Icon
                          name="database"
                          color={color("accent2")}
                          mb={3}
                          size={28}
                        />
                        <h3 className="text-wrap">{database.name}</h3>
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
    <Box mt={3} mb={2}>
      <Flex align="center" mt={1}>
        <BrowserCrumbs crumbs={crumbs} analyticsContext={ANALYTICS_CONTEXT} />
        <div className="flex flex-align-right">
          <Link
            className="flex flex-align-right"
            to="reference"
            data-metabase-event={`NavBar;Reference`}
          >
            <div className="flex align-center text-medium text-brand-hover">
              <Icon className="flex align-center" size={14} name="reference" />
              <Link className="ml1 flex align-center text-bold">
                {t`Learn about our data`}
              </Link>
            </div>
          </Link>
        </div>
      </Flex>
    </Box>
  );
}
