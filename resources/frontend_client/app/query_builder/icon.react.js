'use strict';

import { loadIcon } from 'metabase/icon_paths';

export default React.createClass({
    displayName: 'Icon',
    render: function () {
        var icon = loadIcon(this.props.name);

        if (icon.svg) {
            return (<svg {... icon.attrs} {... this.props} dangerouslySetInnerHTML={{__html: icon.svg}}></svg>);
        } else {
            return (<svg {... icon.attrs} {... this.props}><path d={icon.path} /></svg>);
        }
    }
});
