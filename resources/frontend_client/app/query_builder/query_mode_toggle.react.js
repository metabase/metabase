'use strict';
/*global cx, OnClickOutside, SelectionModule*/

var QueryModeToggle = React.createClass({
    displayName: 'QueryModeToggle',
    propTypes: {
        // description: React.PropTypes.string,
        // hasChanged: React.PropTypes.bool,
        // name: React.PropTypes.string,
        // permissions: React.PropTypes.number,
        // setPermissions: React.PropTypes.func.isRequired,
        // save: React.PropTypes.func.isRequired
    },
    mixins: [],
    getInitialState: function () {
        return {};
    },
    render: function () {
        return (
            <div className="Button-group float-right">
                <button className="Button">GUI</button>
                <button className="Button">SQL</button>
            </div>
        );
    }
});
