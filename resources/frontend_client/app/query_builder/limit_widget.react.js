'use strict';

import Icon from './icon.react';
import SelectionModule from './selection_module.react';

export default React.createClass({
    displayName: 'LimitWidget',
    propTypes: {
        limit: React.PropTypes.number,
        updateLimit: React.PropTypes.func.isRequired,
        removeLimit: React.PropTypes.func.isRequired
    },

    getDefaultProps: function() {
        return {
            options: [
                {key: "All rows", val: null},
                {key: "1 row", val: 1},
                {key: "10 rows", val: 10},
                {key: "25 rows", val: 25},
                {key: "50 rows", val: 50},
                {key: "100 rows", val: 100},
                {key: "1000 rows", val: 1000}
            ]
        };
    },

    setLimit: function(value) {
        if (this.props.limit !== value) {
            this.props.updateLimit(value);
        }
    },

    render: function() {
        return (
            <div className="Query-filter">
                <div className='Filter-section'>
                    <SelectionModule
                        placeholder="How many rows?"
                        items={this.props.options}
                        display="key"
                        selectedKey="val"
                        selectedValue={this.props.limit || null}
                        isInitiallyOpen={false}
                        action={this.setLimit}
                    />
                </div>

                <a onClick={this.props.removeLimit}>
                    <Icon name='close' width="12px" height="12px" />
                </a>
            </div>
        );
    }
});
