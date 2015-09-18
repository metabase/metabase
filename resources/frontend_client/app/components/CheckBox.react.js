'use strict';

import React, { Component } from 'react';
import Icon from 'metabase/components/Icon.react';

export default class CheckBox extends Component {
    render() {
        const { checked } = this.props;
        const style = {
            width: '1rem',
            height: '1rem',
            border: '2px solid #ddd',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        };
        return (
            <div style={style}>
                { checked? <Icon name='check' width={10} height={10} /> : null }
            </div>
        )
    }
}
