'use strict';

var Icon = React.createClass({
    displayName: 'Icon',
    iconPaths: {
        addtodash: [
            'M16,31 L16,31 C24.2842712,31 31,24.2842712 31,16 C31,7.71572875 24.2842712,1 16,1 C7.71572875,1 1,7.71572875 1,16 C1,24.2842712 7.71572875,31 16,31 L16,31 Z M16,32 L16,32 C7.163444,32 0,24.836556 0,16 C0,7.163444 7.163444,0 16,0 C24.836556,0 32,7.163444 32,16 C32,24.836556 24.836556,32 16,32 L16,32 Z',
            'M17,15.5 L17,10 L15,10 L15,15.5 L9.5,15.5 L9.5,17.5 L15,17.5 L15,23 L17,23 L17,17.5 L22.5,17.5 L22.5,15.5 L17,15.5 Z',
        ],
        check: 'M1 14 L5 10 L13 18 L27 4 L31 8 L13 26 z ',
        close: 'M4 8 L8 4 L16 12 L24 4 L28 8 L20 16 L28 24 L24 28 L16 20 L8 28 L4 24 L12 16 z ',
        download: [
            'M17,16.5 L17,8 L15,8 L15,16.5 L11,16.5 L9.93247919,16.5 L10.6158894,17.3200922 L15.6158894,23.3200922 L16,23.781025 L16.3841106,23.3200922 L21.3841106,17.3200922 L22.0675208,16.5 L21,16.5 L17,16.5 L17,16.5 Z',
            'M16,31 L16,31 C24.2842712,31 31,24.2842712 31,16 C31,7.71572875 24.2842712,1 16,1 C7.71572875,1 1,7.71572875 1,16 C1,24.2842712 7.71572875,31 16,31 L16,31 Z M16,32 L16,32 C7.163444,32 0,24.836556 0,16 C0,7.163444 7.163444,0 16,0 C24.836556,0 32,7.163444 32,16 C32,24.836556 24.836556,32 16,32 L16,32 Z'
        ],
        expand: 'M16 4 L28 4 L28 16 L24 12 L20 16 L16 12 L20 8z M4 16 L8 20 L12 16 L16 20 L12 24 L16 28 L4 28z ',
    },
    getDefaultProps: function () {
       return {
          width: 32,
          height: 32,
          fill: 'currentcolor'
       };
    },
    render: function () {
        var iconPath = this.iconPaths[this.props.name],
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
