'use strict';

import Icon from './icon.react';

export default React.createClass({
    displayName: 'DataReferenceQueryButton',
    propTypes: {
        icon: React.PropTypes.string.isRequired,
        text: React.PropTypes.string.isRequired,
        onClick: React.PropTypes.func
    },

    render: function(page) {
        return (
            <div className={this.props.className}>
                <a className="DataRefererenceQueryButton flex align-center no-decoration py1" href="#" onClick={this.props.onClick}>
                    <Icon name={this.props.icon} />
                    <span className="DataRefererenceQueryButton-text mx2 text-default text-brand-hover">{this.props.text}</span>
                    <span className="DataRefererenceQueryButton-circle flex-align-right text-brand">
                        <Icon width="8" height="8" name="chevronright" />
                    </span>
                </a>
            </div>
        );
    }
});
