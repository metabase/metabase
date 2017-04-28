import React, { Component } from "react";
import { connect } from "react-redux";

import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";
import ModalContent from "metabase/components/ModalContent";

import CollectionList from "./CollectionList";

import cx from "classnames";

import { setCollection } from "../questions";
import { loadCollections } from "../collections";

const mapStateToProps = (state, props) => ({

})

const mapDispatchToProps = {
    loadCollections,
    setCollection
}

@connect(mapStateToProps, mapDispatchToProps)
export default class MoveToCollection extends Component {
    constructor(props) {
        super(props);
        this.state = {
            collectionId: props.initialCollectionId
        }
    }

    componentWillMount() {
        this.props.loadCollections()
    }

    async onMove(collectionId) {
        try {
            this.setState({ error: null })
            await this.props.setCollection(this.props.questionId, collectionId, true);
            this.props.onClose();
        } catch (e) {
            this.setState({ error: e })
        }
    }

    render() {
        const { onClose } = this.props;
        const { collectionId, error } = this.state;
        return (
            <ModalContent
                title="Which collection should this be in?"
                footer={
                    <div>
                        { error &&
                            <span className="text-error mr1">{error.data && error.data.message}</span>
                        }
                        <Button className="mr1" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button primary disabled={collectionId === undefined} onClick={() => this.onMove(collectionId)}>
                            Move
                        </Button>
                    </div>
                }
                fullPageModal={true}
                onClose={onClose}
            >
                <CollectionList writable>
                    { collections =>
                        <ol className="List text-brand ml-auto mr-auto" style={{ width: 520 }}>
                            { [{ name: "None", id: null }].concat(collections).map((collection, index) =>
                                <li
                                    className={cx("List-item flex align-center cursor-pointer mb1 p1", { "List-item--selected": collection.id === collectionId })}
                                    key={index}
                                    onClick={() => this.setState({ collectionId: collection.id })}
                                >
                                    <Icon
                                        className="Icon mr2"
                                        name="all"
                                        style={{
                                            color: collection.color,
                                            visibility: collection.color == null ? "hidden" : null
                                        }}
                                    />
                                    <h3 className="List-item-title">{collection.name}</h3>
                                </li>
                            )}
                        </ol>
                    }
                </CollectionList>
            </ModalContent>
        )
    }
}
