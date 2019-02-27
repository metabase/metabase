import React from "react";
import { Box, Flex } from "grid-styled";
import { t } from "c-3po";
import BrowserCrumbs from "metabase/components/BrowserCrumbs";
import { connect } from "react-redux";

import Database from "metabase/entities/databases";
import Schema from "metabase/entities/schemas";
import Table from "metabase/entities/tables";

import EntityItem from "metabase/components/EntityItem";

import { normal } from "metabase/lib/colors";
import Question from "metabase-lib/lib/Question";
import { getXraysEnabled } from "metabase/selectors/settings";

import Card from "metabase/components/Card";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import Subhead from "metabase/components/Subhead";
import Tooltip from "metabase/components/Tooltip";

import _ from "underscore";

/** Returns a default Question instance for the provided table */
function getDefaultQuestionForTable(table) {
  if (table.entity_type === "entity/GoogleAnalyticsTable") {
    const dateField = _.findWhere(table.fields, { name: "ga:date" });
    if (dateField) {
      return Question.create()
        .setDatasetQuery({
          database: table.db_id,
          type: "query",
          query: {
            "source-table": table.id,
            aggregation: [["metric", "ga:users"], ["metric", "ga:pageviews"]],
            breakout: [
              ["datetime-field", ["field-id", dateField.id], "as", "week"],
            ],
            filter: ["time-interval", ["field-id", dateField.id], -365, "day"],
          },
        })
        .setDisplay("line");
    }
  }
  return Question.create({
    databaseId: table.db_id,
    tableId: table.id,
  });
}

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
                <Box my={2}>
                  <BrowserCrumbs
                    analyticsContext={ANALYTICS_CONTEXT}
                    crumbs={[
                      { title: t`Our data`, to: "browse" },
                      { title: <Database.Name id={dbId} /> },
                    ]}
                  />
                </Box>
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
  xraysEnabled: getXraysEnabled(state),
}))
export class TableBrowser extends React.Component {
  render() {
    const { dbId, schemaName } = this.props.params;
    return (
      <Box>
        <Table.ListLoader query={{ dbId, schemaName }}>
          {({ tables, loading, error }) => {
            return (
              <Box>
                <Box mt={3} mb={2}>
                  <BrowserCrumbs
                    analyticsContext={ANALYTICS_CONTEXT}
                    crumbs={[
                      { title: t`Our data`, to: "browse" },
                      {
                        title: <Database.Name id={dbId} />,
                        to: `browse/${dbId}`,
                      },
                      schemaName != null && { title: schemaName },
                    ]}
                  />
                </Box>
                <Grid>
                  {tables.map(table => {
                    const link = getDefaultQuestionForTable(table).getUrl();
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
        <Box my={2}>
          <BrowserCrumbs
            crumbs={[{ title: t`Our data` }]}
            analyticsContext={ANALYTICS_CONTEXT}
          />
        </Box>
        <Database.ListLoader>
          {({ databases, loading, error }) => {
            return (
              <Grid>
                {databases.map(database => (
                  <GridItem w={ITEM_WIDTHS} key={database.id}>
                    <Link
                      to={`browse/${database.id}`}
                      data-metabase-event={`${ANALYTICS_CONTEXT};Database Click`}
                    >
                      <Card p={3} hover={{ color: normal.blue }}>
                        <Icon name="database" color={normal.grey2} mb={3} />
                        <Subhead>{database.name}</Subhead>
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
