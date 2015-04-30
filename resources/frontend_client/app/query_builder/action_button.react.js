'use strict';
/*global cx, OnClickOutside, SelectionModule*/

var ActionButton = React.createClass({
    displayName: 'ActionButton',
    propTypes: {
        actionFn: React.PropTypes.func.isRequired
    },
    getDefaultProps: function() {
        return {
            normalText: "Save",
            activeText: "Saving ...",
            failedText: "Save failed",
            successText: "Save succeeded"
        };
    },
    getInitialState: function () {
        return {
            active: false,
            result: null
        };
    },
    resetStateOnTimeout: function() {
        // clear any previously set timeouts then start a new one
        clearTimeout(this.timeout);

        var component = this;
        this.timeout = setTimeout(function() {
            if (component.isMounted()) {
                component.replaceState(component.getInitialState());
            }
        }.bind(this), 5000);
    },
    onClick: function (event) {
        event.preventDefault();

        // set state to active
        this.setState({
            active: true,
            result: null
        });

        // run the function we want bound to this button
        var component = this;
        this.props.actionFn().then(function(success) {
            component.setState({
                active: false,
                result: "success"
            }, component.resetStateOnTimeout);
        }, function(error) {
            component.setState({
                active: false,
                result: "failed"
            }, component.resetStateOnTimeout);
        });

        // TODO: timeout on success/failed state to reset back to normal state
    },
    render: function() {
        if (this.state.active) {
            // TODO: loading spinner
            return (
                <button className="Button Button--waiting">{this.props.activeText}</button>
            );
        } else if (this.state.result === "success") {
            return (
                <button className="Button Button--success" onClick={this.onClick}><CheckIcon width="12px" height="12px" /> {this.props.successText}</button>
            );
        } else if (this.state.result === "failed") {
            return (
                <button className="Button Button--danger" onClick={this.onClick}>{this.props.failedText}</button>
            );
        } else {
            return (
                <button className="Button" onClick={this.onClick}>{this.props.normalText}</button>
            );
        }
    }
});
