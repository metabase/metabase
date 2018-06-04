import React from "react";
import { Box, Flex, Subhead, Text } from "rebass";
import { t } from "c-3po";

import EntityItem from "metabase/components/EntityItem";
import EntityListLoader from "metabase/entities/containers/EntityListLoader";
import EntityObjectLoader from "metabase/entities/containers/EntityObjectLoader";

import * as Urls from "metabase/lib/urls";

import Question from "metabase-lib/lib/Question";

import { normal } from "metabase/lib/colors";

import Button from "metabase/components/Button";
import Card from "metabase/components/Card";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
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

const FieldListLoader = ({ tableId, ...props }) => (
  <EntityListLoader entityType="fields" entityQuery={{ tableId }} {...props} />
);

const TableInfoLoader = ({ tableId, ...props }) => (
  <EntityObjectLoader
    entityType="tables"
    entityId={tableId}
    properties={["name", "description"]}
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

const TableName = ({ tableId }) => (
  <EntityObjectLoader
    entityType="tables"
    entityId={tableId}
    properties={["name"]}
    loadingAndErrorWrapper={false}
  >
    {({ object }) =>
      object ? <span>{object.display_name || object.name}</span> : null
    }
  </EntityObjectLoader>
);

const FieldLoader = ({ fieldId, ...props }) => (
  <EntityObjectLoader entityType="fields" entityId={fieldId} {...props} />
);

const FieldName = ({ fieldId }) => (
  <EntityObjectLoader
    entityType="fields"
    entityId={fieldId}
    properties={["name"]}
    loadingAndErrorWrapper={false}
  >
    {({ object }) =>
      object ? <span>{object.display_name || object.name}</span> : null
    }
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
                <Grid>
                  {schemas.map(schema => (
                    <GridItem w={1 / 3}>
                      <Link
                        to={`/browse/${dbId}/schema/${schema.name}`}
                        mb={1}
                        hover={{ color: normal.purple }}
                      >
                        <Card hoverable>
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
                <Grid>
                  {tables.map(table => {
                    const link = Question.create({
                      databaseId: parseInt(dbId),
                      tableId: table.id,
                    }).getUrl();

                    return (
                      <GridItem w={1 / 3}>
                        <Link to={link} mb={1} hover={{ color: normal.purple }}>
                          <Card hoverable>
                            <EntityItem
                              item={table}
                              name={table.display_name || table.name}
                              iconName="table"
                              iconColor={normal.purple}
                              withReference={
                                <Box className="hover-child" ml="auto">
                                  <Link
                                    to={`/browse/${dbId}/table/${
                                      table.id
                                    }/info`}
                                  >
                                    <Tooltip tooltip={t`Learn more about this`}>
                                      <Icon name="info" />
                                    </Tooltip>
                                  </Link>
                                </Box>
                              }
                            />
                          </Card>
                        </Link>
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

export class FieldInfoApp extends React.Component {
  render() {
    const { params } = this.props;
    const { dbId, tableId, fieldId } = params;
    return (
      <Box>
        <BrowserCrumbs
          crumbs={[
            { title: t`Your data`, to: "browse" },
            {
              title: <DatabaseName dbId={dbId} />,
              to: `browse/${dbId}`,
            },
            {
              title: <TableName tableId={tableId} />,
            },
            {
              title: <FieldName fieldId={fieldId} />,
            },
          ]}
        />
        <Box>
          <FieldLoader fieldId={fieldId}>
            {({ object }) => {
              console.log("object", object);
              return (
                <Box>
                  <Box mb={2}>
                    <h4>{t`Description`}</h4>
                    <Text>{object.description}</Text>
                  </Box>
                  <Box mb={2}>
                    <h4>{t`Actual name in database`}</h4>
                    <Text>{object.name}</Text>
                  </Box>
                  <Box mb={2}>
                    <h4>{t`Data type`}</h4>
                    <Text>{object.base_type}</Text>
                  </Box>
                  <Box mb={2}>
                    <h4>{t`Field type`}</h4>
                    <Text>{object.special_type}</Text>
                  </Box>
                </Box>
              );
            }}
          </FieldLoader>
        </Box>
      </Box>
    );
  }
}

export class TableInfoApp extends React.Component {
  render() {
    const { params } = this.props;
    const { dbId, tableId } = params;

    return (
      <Box>
        <BrowserCrumbs
          crumbs={[
            { title: t`Your data`, to: "browse" },
            {
              title: <DatabaseName dbId={dbId} />,
              to: `browse/${dbId}`,
            },
            {
              title: <TableName tableId={tableId} />,
            },
            {
              title: t`Info`,
            },
          ]}
        />

        <Flex>
          <Box w={2 / 3}>
            <FieldListLoader tableId={tableId}>
              {({ list }) => {
                return (
                  <table>
                    <thead>
                      <tr>
                        <td>Name</td>
                        <td>Visibility</td>
                        <td>Type</td>
                        <td />
                      </tr>
                    </thead>
                    <tbody>
                      {list.map(field => {
                        return (
                          <tr>
                            <td>
                              <Link
                                to={`browse/${dbId}/table/${tableId}/field/${
                                  field.id
                                }/info`}
                              >
                                <Subhead>{field.display_name}</Subhead>
                              </Link>
                              <Text style={{ maxWidth: 420 }}>
                                {field.description}
                              </Text>
                            </td>
                            <td>{field.visibility_type}</td>
                            <td />
                            <td>
                              <Icon name="gear2" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              }}
            </FieldListLoader>
          </Box>
          <Box w={1 / 3} ml={2}>
            <TableInfoLoader tableId={tableId}>
              {({ object }) => {
                console.log("description", object);
                return (
                  <Box>
                    <Link to={Urls.xrayTable(tableId)}>
                      <Button primary>Xray this table</Button>
                    </Link>

                    <h3>About this table</h3>
                    <Text>{object.description}</Text>

                    <h3>About this table</h3>
                  </Box>
                );
              }}
            </TableInfoLoader>
          </Box>
        </Flex>
      </Box>
    );
  }
}

function colorForCrumb(isLast) {
  return isLast ? normal.grey2 : normal.text;
}

function isLastCrumb(index, crumbs) {
  return index < crumbs.length - 1;
}

const BrowserCrumbs = ({ crumbs }) => (
  <Flex align="center">
    {crumbs.filter(c => c).map((crumb, index, crumbs) => {
      const last = isLastCrumb(index, crumbs);
      return [
        crumb.to ? (
          <Link
            key={"title" + index}
            to={crumb.to}
            color={colorForCrumb(last)}
            className="text-brand-hover"
          >
            <BrowseHeader>{crumb.title}</BrowseHeader>
          </Link>
        ) : (
          <Box color={colorForCrumb(last)}>
            <BrowseHeader>{crumb.title}</BrowseHeader>
          </Box>
        ),
        index < crumbs.length - 1 ? (
          <Icon
            key={"divider" + index}
            name="chevronright"
            mx={2}
            color={normal.grey2}
          />
        ) : null,
      ];
    })}
  </Flex>
);
