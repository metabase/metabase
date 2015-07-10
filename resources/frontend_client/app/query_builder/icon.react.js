'use strict';

import ICON_PATHS from 'metabase/icon_paths';

export default React.createClass({
    displayName: 'Icon',
    getDefaultProps: function () {
       return {
          width: '32px',
          height: '32px',
          fill: 'currentcolor',
          bordered: false,
          rounded: false,
       };
    },
    renderIcon: function () {
        var path;
        var iconPath = ICON_PATHS[this.props.name];

        if(typeof(iconPath) != 'string') {
            // create a path for each path present
            path = iconPath.map(function (path) {
               return (<path d={path} /> );
            });
        } else {
            path = (<path d={iconPath} />);
        }
        return (
            <svg viewBox="0 0 32 32" {... this.props} className={'Icon Icon-' + this.props.name}>
                {path}
            </svg>
        );
    },
    renderBordered: function () {
        return (
            <span className="text-error">
                {this.renderIcon()}
            </span>
        );
    },
    render: function () {
        var props = this.props;

        if(this.props.bordered || this.props.rounded) {
            var iconClasses;
            return (
                <span className={iconClasses}>
                    {this.renderIcon()}
                </span>
            );
        } else {
            return this.renderIcon();
        }
    }
});
