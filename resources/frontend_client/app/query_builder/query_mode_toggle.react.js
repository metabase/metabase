'use strict';
/*global cx, OnClickOutside, SelectionModule*/

var QueryModeToggle = React.createClass({
    displayName: 'QueryModeToggle',
    propTypes: {
        card: React.PropTypes.object.isRequired,
        setQueryModeFn: React.PropTypes.func.isRequired
    },
    mixins: [],
    getInitialState: function () {
        return {};
    },
    render: function () {
        // only render if the card is NEW && unmodified
        if (this.props.card.id !== undefined ||
            this.props.card.isDirty() ||
            !this.props.card.dataset_query) {
            return false;
        }

        var guiButton;
        if (this.props.card.dataset_query.type === 'query') {
            guiButton = (
                <button className="Button Button--active">GUI</button>
            );
        } else {
            guiButton = (
                <button className="Button" onClick={this.props.setQueryModeFn.bind(this, 'query')}>GUI</button>
            );
        }

        var nativeButton;
        if (this.props.card.dataset_query.type === 'native') {
            nativeButton = (
                <button className="Button Button--active">SQL</button>
            );
        } else {
            nativeButton = (
                <button className="Button" onClick={this.props.setQueryModeFn.bind(this, 'native')}>SQL</button>
            );
        }

        return (
            <div className="Button-group">
                {guiButton}
                {nativeButton}
            </div>
        );
    }
});
