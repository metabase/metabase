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
        // TODO: need to add in check for card.isDirty
        if (this.props.card.id !== undefined ||
            !this.props.card.dataset_query) {
            return false;
        }

        var newType;

        // set up a horthand for the current type
        var type = this.props.card.dataset_query.type;

        // determine the type to switch to based on the type
        type === 'query' ? newType = 'native' : newType = 'query';

        // set css classes based on the current type
        var buttonClasses = cx({
            'Button-toggle': true,
            'Button--toggled': type === 'native',
        });

        return (
            <div className={buttonClasses} onClick={this.props.setQueryModeFn.bind(this, newType)}>
                <span className="Button-toggleIndicator">
                    <svg className="Sql-icon" width="14px" height="14px" viewBox="0 0 16 16" fill="currentcolor">
                        <path d="M-0.237037037,9.10836763 L-0.237037037,11.8518519 L6.16296296,5.92592593 L-0.237037037,8.22888605e-15 L-0.237037037,2.74348422 L3.2,5.92592593 L-0.237037037,9.10836763 Z M4.14814815,13.44 L16,13.44 L16,16 L4.14814815,16 L4.14814815,13.44 Z">
                        </path>
                    </svg>
                </span>
            </div>
        );
    }
});
