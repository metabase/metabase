import React from "react";
import Icon from "metabase/components/Icon";
import { Flex } from "grid-styled";

import Collection from "metabase/entities/collections";
import Schemas from "metabase/entities/schemas";
import CollectionsList from "metabase/collections/components/CollectionsList";

import { generateSchemaId } from "metabase/schema";
import { MetabaseApi } from "metabase/services";

// TODO - chastise Cam for this :P
const SAVED_QUESTION_DB_ID = -1337;

@Schemas.load({
  id: (state, props) =>
    generateSchemaId(SAVED_QUESTION_DB_ID, props.schemaName),
})
class SavedQuestionTableList extends React.Component {
  render() {
    const { tables = [] } = this.props.schema;
    if (tables.length > 0) {
      return (
        <ol className="px3">
          {tables.map(t => (
            <li
              key={t.id}
              onClick={() => {
                this.props.query
                  .setTableId(t.id)
                  .setDefaultQuery()
                  .update(null, { run: true });
              }}
            >
              <Icon name="table2" />
              {t.display_name}
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
    // TODO - remove once we're done testing

    window.query = this.props.query;
    // IMPORTANT
    // set the database to be the saved question database when we mount
    this.props.query.setDatabaseId(SAVED_QUESTION_DB_ID);
    // TODO api response is unfortunate so we'll absolutely need to make this
    // respond better
    const collectionSchemas = await MetabaseApi.db_schemas({
      dbId: SAVED_QUESTION_DB_ID,
    });

    this.setState({
      isLoading: false,
      // set the current schema to the our analytics one, eventually this should be more
      // intelligent based on where you've been working a lot
      currentSchema: "Everything else",
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
      // create a filter for the collection list that checks to see if any of the collections map to a schema with the same name
      // THIS SHOULD BE UNNECESSARY AFTER WE CLEAN UP THE ENDPOINT
      const filter = collection => {
        return this.state.collectionSchemas.indexOf(collection.name) >= 0;
      };
      return (
        <div style={{ width: 480 }} className="flex">
          <div className="border-right" style={{ width: 240 }}>
            <div>
              <span
                onClick={() => onBack()}
                className="text-brand-hover flex align-center"
              >
                <Icon name="chevronleft" />
                Back
              </span>
            </div>
            <span
              onClick={() =>
                this.setState({ currentSchema: "Everything else" })
              }
            >
              Our analytics
            </span>
            <CollectionsList
              openCollections={this.state.openCollections}
              collections={collections}
              filter={filter}
              onClose={this.onClose}
              onOpen={this.onOpen}
              useTriggerComponent={(collection, props) => {
                console.log(collection, props);
                // TODO - this is duplicated w/ the code in CollectionList
                const isOpen =
                  props.openCollections.indexOf(collection.id) >= 0;
                const action = isOpen ? props.onClose : props.onOpen;
                return (
                  <div>
                    <Flex
                      className="relative"
                      align={
                        // if a colleciton name is somewhat long, align things at flex-start ("top") for a slightly better
                        // visual
                        collection.name.length > 25 ? "flex-start" : "center"
                      }
                      onClick={() => {
                        action(collection.id);
                        this.setState({ currentSchema: collection.name });
                      }}
                    >
                      {/* TODO - this seeems like it's not properly indicating children */}
                      {collection.children && (
                        <Flex
                          className="absolute text-brand cursor-pointer"
                          align="center"
                          justifyContent="center"
                          style={{ left: -20 }}
                        >
                          <Icon
                            name={isOpen ? "chevrondown" : "chevronright"}
                            onClick={ev => {
                              ev.preventDefault();
                              action(collection.id);
                            }}
                            size={12}
                          />
                        </Flex>
                      )}
                      <Icon
                        name={props.initialIcon}
                        mr={"6px"}
                        style={{ opacity: 0.4 }}
                      />
                      {collection.name}
                    </Flex>
                    {isOpen && collection.children && (
                      <CollectionsList
                        openCollections={props.openCollections}
                        onOpen={props.onOpen}
                        onClose={props.onClose}
                        collections={collection.children}
                        filter={props.filter}
                        currentCollection={props.currentCollection}
                        depth={props.depth + 1}
                        useTriggerComponent={props.useTriggerComponent}
                      />
                    )}
                  </div>
                );
              }}
            />
          </div>
          <SavedQuestionTableList
            schemaName={this.state.currentSchema}
            query={this.props.query}
          />
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
