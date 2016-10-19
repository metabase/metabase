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

    render() {
        const icon = loadIcon(this.props.name);
        if (!icon) {
            return null;
        }

        const props = { ...icon.attrs, ...this.props };
        for (const prop of ["width", "height", "size", "scale"]) {
            if (typeof props[prop] === "string") {
                props[prop] = parseInt(props[prop], 10);
            }
        }
        if (props.size != null) {
            props.width = props.size;
            props.height = props.size;
        }
        if (props.scale != null && props.width != null && props.height != null) {
            props.width *= props.scale;
            props.height *= props.scale;
        }

        if (icon.img) {
            return (<RetinaImage forceOriginalDimensions={false} {...props} src={icon.img} />);
        } else if (icon.svg) {
            return (<svg {...props} dangerouslySetInnerHTML={{__html: icon.svg}}></svg>);
        } else {
            return (<svg {...props}><path d={icon.path} /></svg>);
        }
    }
}
