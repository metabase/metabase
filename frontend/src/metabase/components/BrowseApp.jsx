import React from "react";
import { Box, Flex, Subhead } from "rebass";
import { t } from "c-3po";

import EntityListLoader from "metabase/entities/containers/EntityListLoader";
//import EntityObjectLoader from "metabase/entities/containers/EntityObjectLoader"

import { normal } from "metabase/lib/colors";
import Question from "metabase-lib/lib/Question";

import Card from "metabase/components/Card";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import { MetabaseApi } from "metabase/services";

const DatabaseListLoader = ({ children, ...props }) => (
  <EntityListLoader
    entityType="databases"
    children={({ list, ...rest }) => children({ databases: list, ...rest })}
    {...props}
  />
);

export class TableListLoader extends React.Component {
  state = {
    tables: null,
    db_info: null,
    loading: false,
    error: null,
  };

  componentWillMount() {
    this._loadTables(this.props.dbId);
  }

  async _loadTables(dbId) {
    try {
      this.setState({ loading: true });
      const { tables, ...db_info } = await MetabaseApi.db_metadata({ dbId });
      this.setState({ tables, db_info, loading: false });
    } catch (error) {
      this.setState({ loading: false, error });
    }
  }
  render() {
    const { tables, db_info, loading, error } = this.state;
    return this.props.children({ tables, loading, db_info, error });
  }
}

const BrowseHeader = ({ children }) => (
  <Box my={3}>
    <Subhead>{children}</Subhead>
  </Box>
);

/*
const TableListLoader = ({ children,  dbId }) =>
  <EntityObjectLoader
    entityType="databases"
    entityId={dbId}
    query={{ include_tables: true }}
    children={({ object }) => {
      console.log(object)
      return children({
        tables: object.tables,
        db_info: object
      })
    }}
  />
  */

export class TableBrowser extends React.Component {
  render() {
    return (
      <Box>
        <TableListLoader dbId={this.props.params.dbId}>
          {({ tables, db_info, loading, error }) => {
            if (loading) {
              return <Box>Loading...</Box>;
            }

            if (error) {
              alert(error);
            }

            return (
              <Box>
                <Flex align="center">
                  <Link to="browse">
                    <BrowseHeader>{t`Your data`}</BrowseHeader>
                  </Link>
                  <Icon name="chevronright" mx={2} />
                  <BrowseHeader>{db_info.name}</BrowseHeader>
                </Flex>
                {tables.map(table => {
                  const link = Question.create({
                    databaseId: db_info.id,
                    tableId: table.id,
                  }).getUrl();

                  return (
                    <Link to={link} mb={1} hover={{ color: normal.blue }}>
                      <Card p={2} mb={1}>
                        <Flex align="center">
                          <Icon mr={1} name="table" />
                          {table.display_name || table.name}
                          {table.description}
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
        <BrowseHeader>Your data</BrowseHeader>
        <DatabaseListLoader>
          {({ databases, loading, error }) => {
            return (
              <Flex wrap>
                {databases.map(database => (
                  <Box flex={1}>
                    <Link to={`browse/${database.id}`}>
                      <Card p={3} hover={{ color: normal.blue }}>
                        <Icon name="database" color={normal.grey2} />
                        <Subhead>{database.name}</Subhead>
                      </Card>
                    </Link>
                  </Box>
                ))}
              </Flex>
            );
          }}
        </DatabaseListLoader>
      </Box>
    );
  }
}
