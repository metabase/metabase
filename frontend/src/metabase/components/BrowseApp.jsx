import React from "react";
import { Box, Flex, Subhead, Text } from "rebass";
import { t } from "c-3po";

import EntityListLoader from "metabase/entities/containers/EntityListLoader";
import EntityObjectLoader from "metabase/entities/containers/EntityObjectLoader";

import { normal } from "metabase/lib/colors";
import Question from "metabase-lib/lib/Question";

import Card from "metabase/components/Card";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

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

const BrowseHeader = ({ children }) => (
  <Box my={3}>
    <Subhead>{children}</Subhead>
  </Box>
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
                <BrowserCrumbs
                  crumbs={[
                    { title: t`Your data`, to: "browse" },
                    { title: <DatabaseName dbId={dbId} /> },
                  ]}
                />
                {schemas.map(schema => (
                  <Link
                    to={`/browse/${dbId}/schema/${schema.name}`}
                    mb={1}
                    hover={{ color: normal.blue }}
                  >
                    <Card p={2} mb={1}>
                      <Flex align="center">
                        {/* TODO: schema icon? */}
                        {/* <Icon mr={1} name="table" /> */}
                        <Box>{schema.name}</Box>
                      </Flex>
                    </Card>
                  </Link>
                ))}
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
                <BrowserCrumbs
                  crumbs={[
                    { title: t`Your data`, to: "browse" },
                    {
                      title: <DatabaseName dbId={dbId} />,
                      to: `browse/${dbId}`,
                    },
                    schemaName != null && { title: schemaName },
                  ]}
                />
                {tables.map(table => {
                  const link = Question.create({
                    databaseId: parseInt(dbId),
                    tableId: table.id,
                  }).getUrl();

                  return (
                    <Link to={link} mb={1} hover={{ color: normal.blue }}>
                      <Card p={2} mb={1}>
                        <Flex align="center">
                          <Icon mr={1} name="table" />
                          <Box>
                            {table.display_name || table.name}
                            <Text>{table.description}</Text>
                          </Box>
                        </Flex>
                      </Card>
                    </Link>
                  );
                })}
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
    return (
      <Box className="wrapper lg-wrapper--trim">{this.props.children}</Box>
    );
  }
}

export class DatabaseBrowser extends React.Component {
  render() {
    return (
      <Box>
        <BrowserCrumbs crumbs={[{ title: t`Your data` }]} />
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

const BrowserCrumbs = ({ crumbs }) => (
  <Flex align="center">
    {crumbs.filter(c => c).map((crumb, index, crumbs) => [
      crumb.to ? (
        <Link key={"title" + index} to={crumb.to}>
          <BrowseHeader>{crumb.title}</BrowseHeader>
        </Link>
      ) : (
        <BrowseHeader>{crumb.title}</BrowseHeader>
      ),
      index < crumbs.length - 1 ? (
        <Icon key={"divider" + index} name="chevronright" mx={2} />
      ) : null,
    ])}
  </Flex>
);
