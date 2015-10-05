import Humanize from 'humanize';


export default React.createClass({
    displayName: 'ExpandableString',

    getDefaultProps: function () {
        return {
            length: 140,
            expanded: false
        };
    },

    getInitialState: function() {
        return {
            expanded: false
        };
    },

    componentWillReceiveProps: function(newProps) {
        this.setState({
            expanded: newProps.expanded
        });
    },

    toggleExpansion: function() {
        this.setState({
            expanded: !this.state.expanded
        });
    },

    render: function () {
        if (!this.props.str) return false;

        var truncated = Humanize.truncate(this.props.str || "", 140);

        if (this.state.expanded) {
            return (<span>{this.props.str} <span className="block mt1 link" onClick={this.toggleExpansion}>View less</span></span>);
        } else if (truncated !== this.props.str) {
            return (<span>{truncated} <span className="block mt1 link" onClick={this.toggleExpansion}>View more</span></span>);
        } else {
            return (<span>{this.props.str}</span>);
        }
    }
});
