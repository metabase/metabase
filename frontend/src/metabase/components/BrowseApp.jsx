import React from "react";
import { Box, Flex } from "grid-styled";
import { t } from "c-3po";
import BrowserCrumbs from "metabase/components/BrowserCrumbs";

import EntityItem from "metabase/components/EntityItem";
import EntityListLoader from "metabase/entities/containers/EntityListLoader";
import EntityObjectLoader from "metabase/entities/containers/EntityObjectLoader";

import { normal } from "metabase/lib/colors";
import Question from "metabase-lib/lib/Question";

import Card from "metabase/components/Card";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import Subhead from "metabase/components/Subhead";
import Tooltip from "metabase/components/Tooltip";

export const DatabaseListLoader = props => (
  <EntityListLoader entityType="databases" {...props} />
);

const SchemaListLoader = ({ dbId, ...props }) => (
  <EntityListLoader entityType="schemas" entityQuery={{ dbId }} {...props} />
);

const TableListLoader = ({ dbId, schemaName, ...props }) => (
  <EntityListLoader
    entityType="tables"
    entityQuery={{ dbId, schemaName }}
    {...props}
  />
);

const DatabaseName = ({ dbId }) => (
  <EntityObjectLoader
    entityType="databases"
    entityId={dbId}
    properties={["name"]}
    loadingAndErrorWrapper={false}
  >
    {({ object }) => (object ? <span>{object.name}</span> : null)}
  </EntityObjectLoader>
);

export class SchemaBrowser extends React.Component {
  render() {
    const { dbId } = this.props.params;
    return (
      <Box>
        <SchemaListLoader dbId={dbId}>
          {({ schemas }) =>
            schemas.length > 1 ? (
              <Box>
                <Box my={2}>
                  <BrowserCrumbs
                    crumbs={[
                      { title: t`Our data`, to: "browse" },
                      { title: <DatabaseName dbId={dbId} /> },
                    ]}
                  />
                </Box>
                <Grid>
                  {schemas.map(schema => (
                    <GridItem w={1 / 3}>
                      <Link
                        to={`/browse/${dbId}/schema/${schema.name}`}
                        mb={1}
                        hover={{ color: normal.purple }}
                      >
                        <Card hoverable px={1}>
                          <EntityItem
                            name={schema.name}
                            iconName="folder"
                            iconColor={normal.purple}
                            item={schema}
                          />
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
        </SchemaListLoader>
      </Box>
    );
  }
}

export class TableBrowser extends React.Component {
  render() {
    const { dbId, schemaName } = this.props.params;
    return (
      <Box>
        <TableListLoader dbId={dbId} schemaName={schemaName}>
          {({ tables, loading, error }) => {
            return (
              <Box>
                <Box my={2}>
                  <BrowserCrumbs
                    crumbs={[
                      { title: t`Our data`, to: "browse" },
                      {
                        title: <DatabaseName dbId={dbId} />,
                        to: `browse/${dbId}`,
                      },
                      schemaName != null && { title: schemaName },
                    ]}
                  />
                </Box>
                <Grid>
                  {tables.map(table => {
                    const link = Question.create({
                      databaseId: parseInt(dbId),
                      tableId: table.id,
                    }).getUrl();

                    return (
                      <GridItem w={1 / 3}>
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
                                <Tooltip tooltip={t`X-ray this table`}>
                                  <Link to={`auto/dashboard/table/${table.id}`}>
                                    <Icon
                                      name="bolt"
                                      mx={1}
                                      color={normal.yellow}
                                      size={20}
                                    />
                                  </Link>
                                </Tooltip>
                                <Tooltip tooltip={t`Learn about this table`}>
                                  <Link
                                    to={`reference/databases/${dbId}/tables/${
                                      table.id
                                    }`}
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
        </TableListLoader>
      </Box>
    );
  }
}

export class BrowseApp extends React.Component {
  render() {
    return <Box mx={4}>{this.props.children}</Box>;
  }
}

export class DatabaseBrowser extends React.Component {
  render() {
    return (
      <Box>
        <Box my={2}>
          <BrowserCrumbs crumbs={[{ title: t`Our data` }]} />
        </Box>
        <DatabaseListLoader>
          {({ databases, loading, error }) => {
            return (
              <Grid>
                {databases.map(database => (
                  <GridItem>
                    <Link to={`browse/${database.id}`}>
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
        </DatabaseListLoader>
      </Box>
    );
  }
}
