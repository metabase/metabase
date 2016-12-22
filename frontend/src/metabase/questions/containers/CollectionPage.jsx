import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";
import { push, replace, goBack } from "react-router-redux";

import HeaderWithBack from "metabase/components/HeaderWithBack";

import CollectionActions from "../components/CollectionActions";
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
    loadCollections,
    editCollection: (id) => push(`/collections/${id}`),
    editPermissions: (id) => push(`/collections/permissions?collection=${id}`)
})

@connect(mapStateToProps, mapDispatchToProps)
export default class CollectionPage extends Component {
    componentWillMount () {
        this.props.loadCollections();
    }
    render () {
        const { collection, params, location, push, replace, goBack } = this.props;
        console.log("collection", collection)
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
                        <CollectionActions
                            actions={[
                                { name: 'Archive collection', icon: 'archive',  action: () => alert('NYI: archive!') },
                                { name: 'Edit collection', icon: 'pencil',  action: () => this.props.editCollection(this.props.collection.id) },
                                { name: 'Set permissions', icon: 'lock',  action: () => this.props.editPermissions(this.props.collection.id) },
                            ]}
                        />
                    </div>
                </div>
                <div className="mt4">
                    <EntityList
                        query={{ f: "all", collection: params.collectionSlug, ...location.query }}
                        // use replace when changing sections so back button still takes you back to collections page
                        onChangeSection={(section) => replace({
                            ...location,
                            query: { ...location.query, f: section }
                        })}
                        showCollectionName={false}
                    />
                </div>
            </div>
        );
    }
}
