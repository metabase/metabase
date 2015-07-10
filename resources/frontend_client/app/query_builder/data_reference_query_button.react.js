'use strict';

import Icon from './icon.react';

export default React.createClass({
    displayName: 'DataReferenceQueryButton',

    render: function(page) {
        return (
            <a className="DataRefererenceQueryButton border-bottom border-top flex align-center no-decoration py1 mb3" href="#" onClick={this.props.onClick}>
                <Icon name={this.props.icon} />
                <span className="DataRefererenceQueryButton-text mx2 text-default">{this.props.text}</span>
                <span className="DataRefererenceQueryButton-circle flex-align-right text-brand">
                    <Icon width="8" height="8" name="chevronright" />
                </span>
            </a>
        );
    }
});
