'use strict';
/*global cx, OnClickOutside, SelectionModule*/

var QueryModeToggle = React.createClass({
    displayName: 'QueryModeToggle',
    propTypes: {
        card: React.PropTypes.object.isRequired,
        setQueryModeFn: React.PropTypes.func.isRequired
    },
    render: function () {
        // only render if the card is NEW && unmodified
        if (this.props.card.id !== undefined ||
            this.props.card.isDirty() ||
            !this.props.card.dataset_query) {
            return false;
        }

        var newType;
        // shorthand for the current type
        var type = this.props.card.dataset_query.type;

        // determine the type to switch to based on the type
        type === 'query' ? newType = 'native' : newType = 'query';

        // set css classes based on the current type
        var buttonClasses = cx({
            'Button-toggle': true,
            'Mode--native': type === 'native',
            'Mode--query': type === 'query'
        });

        return (
            <div className={buttonClasses} onClick={this.props.setQueryModeFn.bind(this, newType)}>
                <span className="Button-toggleIndicator"></span>
            </div>
        );
    }
});
