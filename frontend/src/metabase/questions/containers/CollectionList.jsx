import React, { Component } from "react";
import { connect } from "react-redux";

import { getCollections } from "../selectors";
import { loadCollections } from "../collections";

const mapStateToProps = (state, props) => ({
    collections: getCollections(state, props)
})

const mapDispatchToProps = {
    loadCollections
}

@connect(mapStateToProps, mapDispatchToProps)
class Collections extends Component {
    componentWillMount() {
        this.props.loadCollections();
    }
    render () {
        const collectionList = this.props.children(this.props.collections)
        return collectionList && React.Children.only(collectionList);
    }
}

export default Collections;
