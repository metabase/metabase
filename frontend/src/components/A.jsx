import React, { Component, PropTypes } from "react";

import MetabaseAnalytics from "metabase/lib/analytics";

import _ from "underscore";


export default React.createClass({
    displayName: 'A',
    propTypes: {
        metabaseEvent: PropTypes.array,
        functions: PropTypes.array
    },

    clicked: function(e) {
        const {functions, metabaseEvent} = this.props;

        // call any supplied functions first
        if (functions) {
            if (_.isFunction(functions)) {
                functions();
            } else if (_.isArray(functions) && functions.length > 0) {
                functions.forEach((val) => val());
            }
        }

        // then do our tracking
        if (metabaseEvent) {
            MetabaseAnalytics.trackEvent(...metabaseEvent);
        }
    },

    render: function() {
        const anchorProps = _.omit(this.props, "metabaseEvent", "functions", "children");
        return (<a onClick={this.clicked} {...anchorProps}>{this.props.children}</a>)
    }
});
