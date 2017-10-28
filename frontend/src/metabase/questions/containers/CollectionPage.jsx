import React, { Component } from "react";
import { connect } from "react-redux";
import { push, replace, goBack } from "react-router-redux";
import title from "metabase/hoc/Title";

import EntityList from "./EntityList";
import EntityMenu from "metabase/components/EntityMenu";
import HeaderWithBack from "metabase/components/HeaderWithBack";

import { loadCollections } from "../collections";


import _ from "underscore";

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
})

@connect(mapStateToProps, mapDispatchToProps)
@title(({ collection }) => collection && collection.name)
export default class CollectionPage extends Component {
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
                                        // TODO - @kdoh figure out archive
                                        action: () => alert('This should archive')
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
                        entityQuery={{ f: "all", collection: params.collectionSlug, ...location.query }}
                        // use replace when changing sections so back button still takes you back to collections page
                        onChangeSection={(section) => replace({
                            ...location,
                            query: { ...location.query, f: section }
                        })}
                        showCollectionName={false}
                        editable={canEdit}
                    />
                </div>
            </div>
        );
    }
}
