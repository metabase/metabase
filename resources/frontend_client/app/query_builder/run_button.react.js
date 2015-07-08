'use strict';

export default React.createClass({
    displayName: 'RunButton',
    propTypes: {
        canRun: React.PropTypes.bool.isRequired,
        isRunning: React.PropTypes.bool.isRequired,
        runFn: React.PropTypes.func.isRequired
    },
    run: function() {

    },
    render: function () {
        // default state is to not render anything if we can't actually run
        var runButton = false;
        if (this.props.canRun) {
            var runButtonText = (this.props.isRunning) ? "Loading..." : "Find out!";
            runButton = (
                <button className="Button Button--primary" onClick={this.props.runFn}>{runButtonText}</button>
            );
        }

        return runButton;
    }
});
