import cx from "classnames";

export default React.createClass({
    displayName: 'RunButton',
    propTypes: {
        canRun: React.PropTypes.bool.isRequired,
        isRunning: React.PropTypes.bool.isRequired,
        isDirty: React.PropTypes.bool.isRequired,
        runFn: React.PropTypes.func.isRequired
    },
    render: function () {
        var runButtonText = (this.props.isRunning) ? "Loading..." : "Run query";
        var classes = cx({
            "Button": true,
            "Button--primary": true,
            "circular": true,
            "RunButton": true,
            "RunButton--hidden": (!this.props.canRun || !this.props.isDirty)
        });
        return (
            <button className={classes} onClick={this.props.runFn}>{runButtonText}</button>
        );
    }
});
