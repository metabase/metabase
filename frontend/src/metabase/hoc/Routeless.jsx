/* @flow weak */

import React, { Component, PropTypes } from "react";

import { connect } from "react-redux";
import { push, goBack } from "react-router-redux";

import _ from "underscore";

// namespace under _routeless_
const mapStateToProps = (state, props) => ({
    _routeless_location: state.routing.locationBeforeTransitions
});

const mapDispatchToProps = {
    _routeless_push: push,
    _routeless_goBack: goBack
};

// this higher order component wraps any component (typically a fullscreen modal) with an "onClose"
// prop, injects an entry in the browser history, and closes the component if the back button is pressed
@connect(mapStateToProps, mapDispatchToProps)
export default (ComposedComponent) => class extends Component {
    static displayName = "Routeless["+(ComposedComponent.displayName || ComposedComponent.name)+"]";

    _state: any;

    componentWillMount() {
        const push = this.props._routeless_push;
        const location = this.props._routeless_location;
        const { pathname, query, search, hash, state } = location;
        // clone the state object otherwise the state will be replaced rather than pushed
        // save the state object so that we know when it's changed
        this._state = typeof state === "object" ? Object.create(state) : {};
        push({ pathname, query, search, hash, state: this._state });
    }

    componentWillReceiveProps(nextProps) {
        const location = this.props._routeless_location;
        const nextLocation = nextProps._routeless_location;
        // if the state previously was the saved one and is now not, then we probably
        // hit the back button, so close the wrapped component
        if (location.state === this._state && nextLocation.state !== this._state) {
            this.props.onClose();
        }
    }

    componentWillUnmount() {
        const location = this.props._routeless_location;
        const goBack = this.props._routeless_goBack;
        // if we unmount (e.x. hit the close button which calls onClose directly) and still have the
        // same state then go back to the original state
        // NOTE: ideally we would remove the current state from the history so the forward
        // button wouldn't be enabled, maybe using `replace`
        if (location.state === this._state) {
            goBack();
        }
    }

    render() {
        const props = _.omit(this.props, "_routeless_location", "_routeless_goBack", "_routeless_push");
        return <ComposedComponent {...props} />
    }
}
