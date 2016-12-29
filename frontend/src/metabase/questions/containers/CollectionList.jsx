import React, { Component } from "react";
import { connect } from "react-redux";

import { getCollections } from "../selectors";

const mapStateToProps = (state) => ({
    collections: getCollections(state)
})

@connect(mapStateToProps)
class Collections extends Component {
    render () {
        const collectionList = this.props.children(this.props.collections)
        return collectionList && React.Children.only(collectionList);
    }
}

export default Collections;
