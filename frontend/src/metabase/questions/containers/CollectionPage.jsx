import React, { Component } from "react";
import { connect } from "react-redux";
import { push, replace, goBack } from "react-router-redux";
import title from "metabase/hoc/Title";

import Icon from "metabase/components/Icon";
import HeaderWithBack from "metabase/components/HeaderWithBack";

import CollectionActions from "../components/CollectionActions";
import ArchiveCollectionWidget from "./ArchiveCollectionWidget";
import EntityList from "./EntityList";
import { loadCollections } from "../collections";

import _ from "underscore";

const mapStateToProps = (state, props) => ({
    collection: _.findWhere(state.collections.collections, { slug: props.params.collectionSlug })
})

const mapDispatchToProps = ({
    push,
    replace,
    goBack,
    goToQuestions: () => push(`/questions`),
    editCollection: (id) => push(`/collections/${id}`),
    editPermissions: (id) => push(`/collections/permissions?collectionId=${id}`),
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
                    <div className="ml-auto">
                        <CollectionActions>
                            { canEdit && <ArchiveCollectionWidget collectionId={this.props.collection.id} onArchived={this.props.goToQuestions}/> }
                            { canEdit && <Icon name="pencil" tooltip="Edit collection" onClick={() => this.props.editCollection(this.props.collection.id)} /> }
                            { canEdit && <Icon name="lock" tooltip="Set permissions" onClick={() => this.props.editPermissions(this.props.collection.id)} /> }
                        </CollectionActions>
                    </div>
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
