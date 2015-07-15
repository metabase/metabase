'use strict';

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
            return (<span>{this.props.str} <span onClick={this.toggleExpansion}>view less</span></span>);
        } else if (truncated !== this.props.str) {
            return (<span>{truncated} <span onClick={this.toggleExpansion}>view more</span></span>);
        } else {
            return (<span>{this.props.str}</span>);
        }
    }
});
