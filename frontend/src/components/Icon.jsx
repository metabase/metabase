/*eslint-disable react/no-danger */

import React, { Component, PropTypes } from "react";
import RetinaImage from "react-retina-image";

import { loadIcon } from 'metabase/icon_paths';

export default class Icon extends Component {
    static propTypes = {
      name: PropTypes.string.isRequired,
      width: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.number,
      ]),
      height: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.number,
      ]),
    }

    static defaultProps = {
      width: 16,
      height: 16
    }

    render() {
        var icon = loadIcon(this.props.name);
        if (!icon) {
            return <span className="hide" />;
        } else if (icon.img) {
            return (<RetinaImage forceOriginalDimensions={false} {...icon.attrs} {...this.props} src={icon.img} />);
        } else if (icon.svg) {
            return (<svg {...icon.attrs} {...this.props} dangerouslySetInnerHTML={{__html: icon.svg}}></svg>);
        } else {
            return (<svg {...icon.attrs} {...this.props}><path d={icon.path} /></svg>);
        }
    }
}
