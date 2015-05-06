'use strict';
/*global SelectionModule, DatabaseSelector*/

var ResultQueryEditor = React.createClass({
    displayName: 'ResultQueryEditor',
    propTypes: {
        queryLink: React.PropTypes.string.isRequired
    },
    render: function () {
        return (
            <div>
                <p>The data for this card comes directly from a saved query. To change the data you can <a href={this.props.queryLink}>Modify the Query.</a></p>
            </div>
        );
    }
});
