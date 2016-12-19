import React, { Component } from "react";
import { connect } from "react-redux";
import { goBack } from "react-router-redux"

import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";
import Modal from "metabase/components/Modal";

import CollectionList from "./CollectionList";

import cx from "classnames";

import { setCollection } from "../questions";

const mapStateToProps = (state, props) => ({

})

const mapDispatchToProps = {
    setCollection,
    goBack
}

@connect(mapStateToProps, mapDispatchToProps)
export default class MoveToCollection extends Component {
    constructor(props) {
        super(props);
        this.state = {
            collectionId: undefined
        }
    }

    async onMove(collectionId) {
        try {
            this.setState({ error: null })
            await this.props.setCollection(this.props.params.questionId, collectionId);
            this.props.goBack();
        } catch (e) {
            this.setState({ error: e })
        }
    }

    render() {
        const { goBack } = this.props;
        const { collectionId, error } = this.state;
        return (
            <Modal
                inline
                title="Which collection should this be in?"
                footer={
                    <div>
                        { error &&
                            <span className="text-error">{error}</span>
                        }
                        <Button className="mr1" onClick={goBack}>
                            Cancel
                        </Button>
                        <Button primary disabled={collectionId === undefined} onClick={() => this.onMove(collectionId)}>
                            Move
                        </Button>
                    </div>
                }
                onClose={goBack}
            >
                <CollectionList>
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
            </Modal>
        )
    }
}
