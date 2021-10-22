/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import { push, goBack } from "react-router-redux";
import _ from "underscore";

// namespace under _routeless_
const mapStateToProps = (state, props) => ({
  _routeless_location: state.routing.locationBeforeTransitions,
});

const mapDispatchToProps = {
  _routeless_push: push,
  _routeless_goBack: goBack,
};

// this higher order component wraps any component (typically a fullscreen modal) with an "onClose"
// prop, injects an entry in the browser history, and closes the component if the back button is pressed
export default (
  ComposedComponent,
  // clone the state object otherwise the state will be replaced rather than pushed
  // save the state object so that we know when it's changed
  // if the state previously was the saved one and is now not, then we probably
  // hit the back button, so close the wrapped component
  // perform this in a timeout because the component may be unmounted anyway, in which
  // case calling onClose again may cause problems.
  // alternatively may be able to tighten up the logic above

  // if we unmount (e.x. hit the close button which calls onClose directly) and still have the
  // same state then go back to the original state
  // NOTE: ideally we would remove the current state from the history so the forward
  // button wouldn't be enabled, maybe using `replace`
) =>
  connect(
    mapStateToProps,
    mapDispatchToProps,
  )(
    class extends Component {
      static displayName =
        "Routeless[" +
        (ComposedComponent.displayName || ComposedComponent.name) +
        "]";

      _state: any;
      _timeout: any;

      UNSAFE_componentWillMount() {
        const push = this.props._routeless_push;
        const location = this.props._routeless_location;
        const { pathname, query, search, hash, state } = location;
        this._state = typeof state === "object" ? Object.create(state) : {};
        push({ pathname, query, search, hash, state: this._state });
      }

      UNSAFE_componentWillReceiveProps(nextProps) {
        const location = this.props._routeless_location;
        const nextLocation = nextProps._routeless_location;
        if (
          location.state === this._state &&
          nextLocation.state !== this._state
        ) {
          this._timeout = setTimeout(() => {
            this.props.onClose();
          }, 100);
        }
      }

      componentWillUnmount() {
        const location = this.props._routeless_location;
        const goBack = this.props._routeless_goBack;

        if (this._timeout != null) {
          clearTimeout(this._timeout);
        }

        if (location.state === this._state) {
          goBack();
        }
      }

      render() {
        const props = _.omit(
          this.props,
          "_routeless_location",
          "_routeless_goBack",
          "_routeless_push",
        );
        return <ComposedComponent {...props} />;
      }
    },
  );
