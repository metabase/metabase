"use strict";

import cx from "classnames";

export default React.createClass({
    displayName: "Toggle",
    propTypes: {
        value: React.PropTypes.bool.isRequired,
        onChange: React.PropTypes.func
    },

    onClick: function() {
        if (this.props.onChange) {
            this.props.onChange(!this.props.value);
        }
    },

    render: function() {
        return (
            <a href="#" className={cx("Toggle", "no-decoration", { selected: this.props.value })} onClick={this.onClick} />
        );
    }
});
