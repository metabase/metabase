import React, { Component, PropTypes } from 'react';
import cx from 'classnames';

export default class UserAvatar extends Component {
    constructor(props, context) {
        super(props, context);
        this.styles = {
            fontSize: '0.85rem',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderRadius: '99px',
            width: '2rem',
            height: '2rem',
        }
    }

    static propTypes = {
        background: PropTypes.string,
        user: PropTypes.object.isRequired
    };

    static defaultProps = {
        background: 'bg-brand'
    };

    userInitials() {
        const { first_name, last_name } = this.props.user;

        let initials = '??';

        if (first_name !== 'undefined') {
            initials = first_name.substring(0, 1).toUpperCase();
        }

        if (last_name !== 'undefined') {
            initials = initials + last_name.substring(0, 1).toUpperCase();
        }

        return initials;
    }

    render() {
        const { background } = this.props;
        const classes = {
            'flex': true,
            'align-center': true,
            'justify-center': true
        }
        classes[background] = true;

        return (
            <div className={cx(classes)} style={Object.assign(this.styles, this.props.style)}>
                {this.userInitials()}
            </div>
        )
    }
}
