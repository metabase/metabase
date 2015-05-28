'use strict';
/*global OnClickOutside*/

import SelectionModule from './selection_module.react';

var cx = React.addons.classSet;

export default React.createClass({
    displayName: 'QueryModeToggle',
    propTypes: {
        currentQueryMode: React.PropTypes.string.isRequired,
        setQueryModeFn: React.PropTypes.func.isRequired
    },

    setMode: function(mode) {
        this.props.setQueryModeFn(mode);
    },

    render: function() {
        // determine the type to switch to based on the type
        var targetType = (this.props.currentQueryMode === "query") ? "native" : "query";

        // set css classes based on the current type
        var buttonClasses = cx({
            'Button-toggle': true,
            'Button--toggled': this.props.currentQueryMode === 'native',
        });

        return (
            <div className={buttonClasses} onClick={this.setMode.bind(this, targetType)}>
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
