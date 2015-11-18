import React, { Component, PropTypes } from 'react';
import Icon from 'metabase/components/Icon.jsx';

export default class CheckBox extends Component {
    static propTypes = {
        checked: PropTypes.bool,
        onChange: PropTypes.func
    };

    onClick() {
        if (this.props.onChange) {
            // TODO: use a proper event object?
            this.props.onChange({ target: { checked: !this.props.checked }})
        }
    }

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
            <div style={style} onClick={() => this.onClick()}>
                { checked ? <Icon name='check' width={10} height={10} /> : null }
            </div>
        )
    }
}
