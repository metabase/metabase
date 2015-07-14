'use strict';

import { loadIcon } from 'metabase/icon_paths';

export default React.createClass({
    displayName: 'Icon',
    render: function () {
        var icon = loadIcon(this.props.name);

        // react uses "className" instead of "class"
        icon.attrs.className = icon.attrs['class'];
        delete icon.attrs['class'];

        if (icon.svg) {
            return (<svg {... icon.attrs} {... this.props} dangerouslySetInnerHTML={{__html: icon.svg}}></svg>);
        } else {
            return (<svg {... icon.attrs} {... this.props}><path d={icon.path} /></svg>);
        }
    }
});
