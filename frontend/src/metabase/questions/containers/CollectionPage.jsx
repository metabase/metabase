import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

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
        const { collection, params, location, push } = this.props;
        return (
            <div className="mx4 mt4">
                <div className="flex align-center">
                    <HeaderWithBack name={collection && collection.name} />
                    <div className="ml-auto">
                        <CollectionActions
                            actions={[
                                { name: 'Archive collection', icon: 'archive',  action: () => alert('NYI: archive!') },
                                { name: 'Edit collection', icon: 'pencil',  action: () => this.props.editCollection(this.props.collection.id) },
                                { name: 'Set permissions', icon: 'lock',  action: () => this.props.editPermissions(this.props.collection.id) },
                                { name: 'Info', icon: 'info', action: () => () => alert('NYI: info!') },
                            ]}
                        />
                    </div>
                </div>
                <div className="mt4">
                    <EntityList
                        query={{ f: "all", collection: params.collectionSlug, ...location.query }}
                        onChangeSection={(section) => push({
                            ...location,
                            query: { ...location.query, f: section }
                        })}
                    />
                </div>
            </div>
        );
    }
}
