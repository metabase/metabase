import React from "react";
import PropTypes from "prop-types";
import Icon from "metabase/components/Icon";
import { Box, Flex } from "grid-styled";
import { t } from "ttag";
import cx from "classnames";

import Collection from "metabase/entities/collections";
import Schemas from "metabase/entities/schemas";

import { generateSchemaId } from "metabase/schema";
import { MetabaseApi } from "metabase/services";

import * as Urls from "metabase/lib/urls";

import CollectionLink from "metabase/collections/components/CollectionLink";
import CollectionDropTarget from "metabase/containers/dnd/CollectionDropTarget";
import { SIDEBAR_SPACER } from "metabase/collections/constants";

// TODO - chastise Cam for this :P
const SAVED_QUESTION_DB_ID = -1337;

@Schemas.load({
  id: (state, props) =>
    generateSchemaId(SAVED_QUESTION_DB_ID, props.schemaName),
})
class SavedQuestionTableList extends React.Component {
  render() {
    const { schema, onChangeTable } = this.props;
    const { tables = [] } = schema;
    if (tables.length > 0) {
      return (
        <ol className="List text-brand px1 pt2 full">
          {tables.map(t => (
            <li
              className="List-section"
              key={t.id}
              onClick={() => {
                onChangeTable(t);
              }}
            >
              <div className="List-item flex mx1">
                <a className="p1 flex-auto flex align-center cursor-pointer">
                  <Icon name="table2" className="mr1" />
                  <h4 className="List-item-title">{t.display_name}</h4>
                </a>
              </div>
            </li>
          ))}
        </ol>
      );
    }
  }
}
SavedQuestionTableList.propTypes = {
  schema: PropTypes.object.isRequired,
  onChangeTable: PropTypes.func.isRequired,
};

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
    const { onBack, collections } = this.props;
    // we assume we're loading so show something
    if (this.state.isLoading) {
      return <div>&quot;Loading...&quot;</div>;
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
          <div className="bg-light border-right" style={{ width: 360 }}>
            <div>
              <div
                onClick={() => onBack()}
                className="text-brand-hover flex align-center p1 border-bottom"
              >
                <Icon name="chevronleft" className="mr1" />
                <h3>{t`Saved questions`}</h3>
              </div>
            </div>
            <div className="my1">
              <CollectionFolder
                collection={{ name: "Our analytics", id: null }}
                onToggleExpanded={() => null}
                onSelect={() =>
                  this.setState({ currentSchema: "Everything else" })
                }
                selected={this.state.currentSchema === "Everything else"}
                depth={1}
              />
              <SavedQuestionCollectionList
                openCollections={this.state.openCollections}
                collections={collections}
                filter={filter}
                onClose={this.onClose}
                onOpen={this.onOpen}
                depth={1}
                triggerComponent={(collection, props) => {
                  // TODO - this is duplicated w/ the code in CollectionList
                  const isOpen =
                    props.openCollections.indexOf(collection.id) >= 0;
                  const action = isOpen ? props.onClose : props.onOpen;
                  return (
                    <div className="relative">
                      <CollectionFolder
                        collection={collection}
                        isOpen={isOpen}
                        onSelect={(collection, ev) => {
                          this.setState({ currentSchema: collection.name });
                          props.onOpen(collection.id);
                        }}
                        onToggleExpanded={(collection, ev) => {
                          ev.preventDefault();
                          action(collection.id);
                        }}
                        depth={props.depth}
                        selected={this.state.currentSchema === collection.name}
                      />
                      {isOpen && collection.children && (
                        <SavedQuestionCollectionList
                          openCollections={props.openCollections}
                          onOpen={props.onOpen}
                          onClose={props.onClose}
                          collections={collection.children}
                          filter={props.filter}
                          currentCollection={props.currentCollection}
                          depth={props.depth + 1}
                          triggerComponent={props.triggerComponent}
                        />
                      )}
                    </div>
                  );
                }}
              />
            </div>
          </div>
          <SavedQuestionTableList
            schemaName={this.state.currentSchema}
            query={this.props.query}
            onChangeSchema={this.props.onChangeSchema}
            onChangeTable={this.props.onChangeTable}
          />
        </div>
      );
    }

    // We shouldn't get here?
    return <div>Welllp</div>;
  }
}
SavedQuestionPicker.propTypes = {
  query: PropTypes.object.isRequired,
  collections: PropTypes.object.isRequired,
  onBack: PropTypes.func.isRequired,
  onChangeSchema: PropTypes.func.isRequired,
  onChangeTable: PropTypes.func.isRequired,
};

//this.setState({ currentSchema: collection.name });
function CollectionFolder({
  collection,
  isOpen,
  onToggleExpanded,
  onSelect,
  selected,
  depth,
}) {
  const SPACER = 8;
  return (
    <Flex
      pl={depth * (SPACER * 2) + SPACER}
      py={"6px"}
      className={cx("relative cursor-pointer text-brand bg-brand-light-hover", {
        "bg-brand text-white": selected,
      })}
      align={
        // if a colleciton name is somewhat long, align things at flex-start ("top") for a slightly better
        // visual
        collection.name.length > 25 ? "flex-start" : "center"
      }
      onClick={ev => {
        onSelect(collection);
      }}
    >
      {/* TODO - this seeems like it's not properly indicating children */}
      {collection.children && (
        <Flex
          className="absolute text-brand cursor-pointer"
          align="center"
          justifyContent="center"
          style={{ left: SPACER * depth + SPACER }}
        >
          <Icon
            name={isOpen ? "chevrondown" : "chevronright"}
            onClick={ev => onToggleExpanded(collection, ev)}
            size={12}
          />
        </Flex>
      )}
      <Icon name="folder" mr={"6px"} style={{ opacity: 0.4 }} />
      {collection.name}
    </Flex>
  );
}
CollectionFolder.propTypes = {
  collection: PropTypes.object.isRequired,
  isOpen: PropTypes.bool,
  selected: PropTypes.bool,
  depth: PropTypes.number.isRequired,
  onToggleExpanded: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
};

export default Collection.loadList({
  query: () => ({ tree: true }),
})(SavedQuestionPicker);

// TODO - this is duplicated w/ the code in CollectionList
// possible merge this with metabase/collections/components/CollectionsList
class SavedQuestionCollectionList extends React.Component {
  render() {
    const {
      filter = () => true,
      // hack to support using nested collections in the data selector, we should
      // move to a more elegant so
      // this is a function that accepts a collection item and returns what we want to have happen based on that
      triggerComponent,
    } = this.props;
    const collections = this.props.collections.filter(filter);

    return (
      <Box>
        {collections.map(c => {
          return triggerComponent(c, this.props);
        })}
      </Box>
    );
  }
}
SavedQuestionCollectionList.propTypes = {
  filter: PropTypes.func,
  triggerComponent: PropTypes.func.isRequired,
  collections: PropTypes.object.isRequired,
};

SavedQuestionCollectionList.defaultProps = {
  initialIcon: "folder",
  depth: 1,
  // named function here avoids eslint error
  triggerComponent: function collectionTrigger(c, props) {
    const isOpen = props.openCollections.indexOf(c.id) >= 0;
    const action = isOpen ? props.onClose : props.onOpen;
    return (
      <Box key={c.id}>
        <CollectionDropTarget collection={c}>
          {({ highlighted, hovered }) => {
            return (
              <CollectionLink
                to={Urls.collection(c.id)}
                // TODO - need to make sure the types match here
                selected={String(c.id) === props.currentCollection}
                depth={props.depth}
                // when we click on a link, if there are children, expand to show sub collections
                onClick={() => c.children && action(c.id)}
                hovered={hovered}
                highlighted={highlighted}
              >
                <Flex
                  className="relative"
                  align={
                    // if a colleciton name is somewhat long, align things at flex-start ("top") for a slightly better
                    // visual
                    c.name.length > 25 ? "flex-start" : "center"
                  }
                >
                  {c.children && (
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
                          action(c.id);
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
                  {c.name}
                </Flex>
              </CollectionLink>
            );
          }}
        </CollectionDropTarget>
        {c.children && isOpen && (
          <Box ml={-SIDEBAR_SPACER} pl={SIDEBAR_SPACER + 10}>
            <SavedQuestionCollectionList
              openCollections={props.openCollections}
              onOpen={props.onOpen}
              onClose={props.onClose}
              collections={c.children}
              filter={props.filter}
              currentCollection={props.currentCollection}
              depth={props.depth + 1}
              triggerComponent={props.triggerComponent}
            />
          </Box>
        )}
      </Box>
    );
  },
};
