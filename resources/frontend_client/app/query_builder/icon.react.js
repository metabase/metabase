'use strict';

import ICON_PATHS from 'metabase/icon_paths';

export default React.createClass({
    displayName: 'Icon',
    getDefaultProps: function () {
       return {
          width: '32px',
          height: '32px',
          fill: 'currentcolor'
       };
    },
    render: function () {
        var iconPath = ICON_PATHS[this.props.name],
            path;

        // handle multi path icons which appear as non strings
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
    }
});
