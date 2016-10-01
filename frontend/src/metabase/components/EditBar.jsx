import React, { Component, PropTypes } from 'react';

class EditBar extends Component {
    static propTypes = {
        title: PropTypes.string.isRequires,
        subtitle: PropTypes.string,
        buttons: PropTypes.oneOf([
                     PropTypes.element,
                     PropTypes.array
                 ]).isRequired,

    }

    render () {
        const { title, subtitle, buttons } = this.props;
        return (
            <div className="EditHeader wrapper py1 flex align-center" ref="editHeader">
                <span className="EditHeader-title">{title}</span>
                { subtitle && <span className="EditHeader-subtitle mx1">{subtitle}</span> }
                <span className="flex-align-right">
                    {buttons}
                </span>
            </div>
        )
    }
}

export default EditBar;
