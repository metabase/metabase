import React, { Component } from "react";
import { connect } from "react-redux";
import _ from "underscore";
import { push, replace, goBack } from "react-router-redux";

import title from "metabase/hoc/Title";

import Button from "metabase/components/Button";
import EntityMenu from "metabase/components/EntityMenu";
import HeaderWithBack from "metabase/components/HeaderWithBack";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import EntityList from "./EntityList";
import { loadCollections, setCollectionArchived } from "../collections";

const mapStateToProps = (state, props) => ({
    // TODO - this should use a selector
    collection: _.findWhere(state.collections.collections, { slug: props.params.collectionSlug })
})

const mapDispatchToProps = ({
    push,
    replace,
    goBack,
    goToQuestions: () => push(`/questions`),
    loadCollections,
    setCollectionArchived
})

@connect(mapStateToProps, mapDispatchToProps)
@title(({ collection }) => collection && collection.name)
export default class CollectionPage extends Component {
    _onArchive = async () => {
        try {
            await this.props.setCollectionArchived(this.props.collection.id, true);
            this._onClose();
            this.props.goToQuestions()
        } catch (error) {
            console.error(error)
            this.setState({ error })
        }
    }

    _onClose = () => {
        if (this.refs.archiveCollection) {
            this.refs.archiveCollection.close();
        }
    }

    componentWillMount () {
        this.props.loadCollections();
    }
    render () {
        const { collection, params, location, push, replace, goBack } = this.props;
        const canEdit = collection && collection.can_write;
        return (
            <div className="mx4 mt4">
                <div className="flex align-center">
                    <HeaderWithBack
                        name={collection && collection.name}
                        description={collection && collection.description}
                        onBack={window.history.length === 1 ?
                            () => push("/questions") :
                            () => goBack()
                        }
                    />
                    { canEdit && (
                        <div className="ml-auto flex align-center">
                            <EntityMenu
                                triggerIcon="pencil"
                                items={[
                                    {
                                        title: t`Edit collection details`,
                                        icon: 'editdocument',
                                        link: `/collections/${collection.id}`
                                    },
                                    {
                                        title: t`Archive this collection`,
                                        icon: 'archive',
                                        action: () => this.refs.archiveCollection.toggle()
                                    }
                                ]}
                            />
                            <EntityMenu
                                triggerIcon="share"
                                items={[
                                    {
                                        title: t`Set permissions`,
                                        icon: 'lock',
                                        link: `/collections/permissions?collectionId=${collection.id}`
                                    },
                                ]}
                            />
                        </div>
                    )}
                </div>
                <div className="mt4">
                    <EntityList
                        defaultEmptyState="No questions have been added to this collection yet."
                        entityType="cards"
                        entityQuery={{
                            f: "all",
                            collection: params.collectionSlug,
                            ...location.query
                        }}
                        // use replace when changing sections so back button
                        // still takes you back to collections page
                        onChangeSection={(section) => replace({
                            ...location,
                            query: { ...location.query, f: section }
                        })}
                        showCollectionName={false}
                        editable={canEdit}
                    />
                </div>
                <ModalWithTrigger
                    {...this.props}
                    ref="archiveCollection"
                    title="Archive this collection?"
                    footer={[
                        <Button onClick={this._onClose}>Cancel</Button>,
                        <Button warning onClick={this._onArchive}>Archive</Button>
                    ]}
                >
                    <div className="px4 pb4">The saved questions in this collection will also be archived.</div>
                </ModalWithTrigger>
            </div>
        );
    }
}
