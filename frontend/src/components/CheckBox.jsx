import React, { Component, PropTypes } from 'react';
import Icon from 'metabase/components/Icon.jsx';

import cx from "classnames";

export default class CheckBox extends Component {
    static propTypes = {
        checked: PropTypes.bool,
        onChange: PropTypes.func
    };

    static defaultProps = {
        size: 16,
        borderColor: "#ddd",
        checkColor: "currentColor"
    };

    onClick() {
        if (this.props.onChange) {
            // TODO: use a proper event object?
            this.props.onChange({ target: { checked: !this.props.checked }})
        }
    }

    render() {
        const { checked, size, borderColor, checkColor, className } = this.props;
        const style = {
            width: size+'px',
            height: size+'px',
            color: checkColor,
            border: '2px solid ' + borderColor,
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        };
        return (
            <div className={cx("cursor-pointer", className)} style={style} onClick={() => this.onClick()}>
                { checked ? <Icon name='check'  width={size - 4} height={size - 4} /> : null }
            </div>
        )
    }
}
