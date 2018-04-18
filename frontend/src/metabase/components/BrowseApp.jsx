import React from "react";
import { Box, Heading, Subhead } from "rebass";
import { Link } from "react-router";

import Question from "metabase-lib/lib/Question";

import { MetabaseApi } from "metabase/services";

export class DatabaseListLoader extends React.Component {
  state = {
    databases: null,
    loading: false,
    error: null,
  };

  componentWillMount() {
    this._loadDatabases();
  }

  async _loadDatabases() {
    try {
      this.setState({ loading: true });
      const databases = await MetabaseApi.db_list();
      this.setState({ databases, loading: false });
    } catch (error) {
      this.setState({ loading: false, error });
    }
  }
  render() {
    const { databases, loading, error } = this.state;
    return this.props.children({ databases, loading, error });
  }
}

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
                <BrowseHeader>{db_info.name}</BrowseHeader>
                {tables.map(table => {
                  const link = Question.create({
                    databaseId: db_info.id,
                    tableId: table.id,
                  }).getUrl();

                  return (
                    <Box>
                      <Link to={link}>{table.display_name || table.name}</Link>
                    </Box>
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
      <Box>
        <Box className="wrapper lg-wrapper--trim">{this.props.children}</Box>
      </Box>
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
            if (loading) {
              return <Box>Loading...</Box>;
            }

            if (error) {
              alert(error);
            }

            return (
              <Box>
                {databases.map(database => (
                  <Box>
                    <Link to={`browse/${database.id}`}>{database.name}</Link>
                  </Box>
                ))}
              </Box>
            );
          }}
        </DatabaseListLoader>
      </Box>
    );
  }
}
