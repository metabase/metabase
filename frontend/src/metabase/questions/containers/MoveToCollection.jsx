import React, { Component } from "react";
import { connect } from "react-redux";
import { t } from "c-3po";
import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";
import ModalContent from "metabase/components/ModalContent";

import CollectionList from "./CollectionList";

import cx from "classnames";

import { setCollection } from "../questions";
import { loadCollections } from "../collections";

const mapStateToProps = (state, props) => ({});

const mapDispatchToProps = {
  loadCollections,
  defaultSetCollection: setCollection,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class MoveToCollection extends Component {
  constructor(props) {
    super(props);
    this.state = {
      currentCollection: { id: props.initialCollectionId },
    };
  }

  componentWillMount() {
    this.props.loadCollections();
  }

  async onMove(collection) {
    try {
      this.setState({ error: null });
      const setCollection =
        this.props.setCollection || this.props.defaultSetCollection;
      await setCollection(this.props.questionId, collection, true);
      this.props.onClose();
    } catch (error) {
      this.setState({ error });
    }
  }

  render() {
    const { onClose } = this.props;
    const { currentCollection, error } = this.state;
    return (
      <ModalContent
        title={t`Which collection should this be in?`}
        footer={
          <div>
            {error && (
              <span className="text-error mr1">
                {error.data && error.data.message}
              </span>
            )}
            <Button className="mr1" onClick={onClose}>
              {t`Cancel`}
            </Button>
            <Button
              primary
              disabled={currentCollection.id === undefined}
              onClick={() => this.onMove(currentCollection)}
            >
              {t`Move`}
            </Button>
          </div>
        }
        fullPageModal={true}
        onClose={onClose}
      >
        <CollectionList writable>
          {collections => (
            <ol
              className="List text-brand ml-auto mr-auto"
              style={{ width: 520 }}
            >
              {[{ name: t`None`, id: null }]
                .concat(collections)
                .map((collection, index) => (
                  <li
                    className={cx(
                      "List-item flex align-center cursor-pointer mb1 p1",
                      {
                        "List-item--selected":
                          collection.id === currentCollection.id,
                      },
                    )}
                    key={index}
                    onClick={() =>
                      this.setState({ currentCollection: collection })
                    }
                  >
                    <Icon
                      className="Icon mr2"
                      name="all"
                      style={{
                        color: collection.color,
                        visibility: collection.color == null ? "hidden" : null,
                      }}
                    />
                    <h3 className="List-item-title">{collection.name}</h3>
                  </li>
                ))}
            </ol>
          )}
        </CollectionList>
      </ModalContent>
    );
  }
}
