'use strict';

export default React.createClass({
    displayName: "ProgressBar",
    propTypes: {
        percentage: React.PropTypes.number.isRequired
    },

    getDefaultProps: function() {
        return {
            className: "ProgressBar"
        };
    },

    render: function() {
        return (
            <div className={this.props.className}>
                <div className="ProgressBar-progress" style={{"width": (this.props.percentage * 100) + "%"}}></div>
            </div>
        );
    }
});
