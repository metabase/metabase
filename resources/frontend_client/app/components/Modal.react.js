'use strict';

import Icon from "metabase/components/Icon.react";
import OnClickOutside from 'react-onclickoutside';

export default React.createClass({
    displayName: "Modal",
    propTypes: {
        title: React.PropTypes.string.isRequired,
        closeFn: React.PropTypes.func.isRequired
    },
    mixins: [OnClickOutside],

    handleClickOutside: function() {
        this.props.closeFn();
    },

    render: function() {
        return (
            <div className="Modal NewForm flex flex-column">
                <div className="Form-header flex align-center">
                    <h2 className="flex-full">{this.props.title}</h2>
                    <a href="#" className="text-grey-3 p1" onClick={this.props.closeFn}>
                        <Icon name='close' width="16px" height="16px"/>
                    </a>
                </div>
                <div className="flex-full scroll-y">
                    {this.props.children}
                </div>
            </div>
        );
    }
});
