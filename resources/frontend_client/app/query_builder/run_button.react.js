'use strict';

export default React.createClass({
    displayName: 'RunButton',
    propTypes: {
        canRun: React.PropTypes.bool.isRequired,
        isRunning: React.PropTypes.bool.isRequired,
        runFn: React.PropTypes.func.isRequired
    },
    render: function () {
        // default state is to not render anything if we can't actually run
        var runButton = false;
        if (this.props.canRun) {
            var runButtonText = (this.props.isRunning) ? "Loading..." : "Run updated query";
            runButton = (
                <button className="Button Button--primary circular" onClick={this.props.runFn}>{runButtonText}</button>
            );
        }

        return runButton;
    }
});
