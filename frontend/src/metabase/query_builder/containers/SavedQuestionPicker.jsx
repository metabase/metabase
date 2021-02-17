import React from "react";
import Icon from "metabase/components/Icon";

import Collection from "metabase/entities/collections";
import CollectionsList from "metabase/collections/components/CollectionsList";
import CollectionLink from "metabase/collections/components/CollectionLink";

import { MetabaseApi } from "metabase/services";

import {
  nonPersonalCollection,
  currentUserPersonalCollections,
  getParentPath,
} from "metabase/collections/utils";

// TODO - chastise Cam for this :P
const SAVED_QUESTION_DB_ID = -1337;

class SavedQuestionTableList extends React.Component {
  state = {
    tables: [],
    loading: true,
  };
  async componentDidMount() {
    await this.fetchTables();
  }

  async fetchTables() {
    this.setState({
      loading: true,
    });
    const schemaTables = await MetabaseApi.db_schema_tables({
      dbId: SAVED_QUESTION_DB_ID,
      schemaName: this.props.schemaName,
    });
    console.log(schemaTables);
    this.setState({
      loading: false,
      tables: schemaTables,
    });
  }
  render() {
    const { loading, tables } = this.state;
    if (loading) {
      return <div>Loading...</div>;
    }
    if (tables.length > 0) {
      return (
        <ol className="px3">
          {tables.map(t => (
            <li key={t.id}>
              <Icon name="table2" />
              {t.display_name})
            </li>
          ))}
        </ol>
      );
    }
  }
}

// TODO - using a class here so we can use lifecycle methods to do some other API fetching,
class SavedQuestionPicker extends React.Component {
  state = {
    isLoading: true,
    collectionSchemas: [],
    currentSchema: null,
    openCollections: [],
  };
  onOpen = id => {
    this.setState({ openCollections: this.state.openCollections.concat(id) });
  };
  onClose = id => {
    this.setState({
      openCollections: this.state.openCollections.filter(c => {
        return c !== id;
      }),
    });
  };
  async componentDidMount() {
    // TODO api response is unfortunate so we'll absolutely need to make this
    // respond better
    const collectionSchemas = await MetabaseApi.db_schemas({
      dbId: SAVED_QUESTION_DB_ID,
    });

    this.setState({
      isLoading: false,
      // set the current schema to the first one, eventually this should be more
      // intelligent based on where you've been working a lot
      currentSchema: collectionSchemas[0],
      collectionSchemas: collectionSchemas.map(c => {
        // account for the fact that the backend still calls that "Everything else"
        // TODO - this should be removed when the endpoint is updated
        if (c === "Everything else") {
          return "Our analytics";
        }
        return c;
      }),
    });
  }

  render() {
    const { onBack, query, collections } = this.props;
    // we assume we're loading so show something
    if (this.state.isLoading) {
      return <div>"Loading..."</div>;
    }

    // if we're not loading
    if (this.state.collectionSchemas.length > 0) {
      const filter = collection => {
        return this.state.collectionSchemas.indexOf(collection.name) >= 0;
      };
      console.log(this.state.collectionSchemas);
      return (
        <div style={{ width: 400 }} className="flex">
          <div className="border-right">
            <div>
              <span
                onClick={() => onBack()}
                className="text-brand-hover flex align-center"
              >
                <Icon name="chevronleft" />
                Back
              </span>
            </div>
            <CollectionsList
              openCollections={this.state.openCollections}
              collections={collections}
              filter={filter}
              onClose={this.onClose}
              onOpen={this.onOpen}
            />
          </div>
          <SavedQuestionTableList schemaName={this.state.currentSchema} />
        </div>
      );
    }

    // We shouldn't get here?
    return <div>Welllp</div>;
  }
}

export default Collection.loadList({
  query: () => ({ tree: true }),
})(SavedQuestionPicker);
