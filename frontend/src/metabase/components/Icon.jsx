/*eslint-disable react/no-danger */

import React, { Component } from "react";
import RetinaImage from "react-retina-image";
import sys from "system-components";

import { loadIcon } from "metabase/icon_paths";

import Tooltipify from "metabase/hoc/Tooltipify";

class BaseIcon extends Component {
  static props: {
    name: string,
    size?: string | number,
    width?: string | number,
    height?: string | number,
    scale?: string | number,
    tooltip?: string, // using Tooltipify
  };

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
      return (
        <RetinaImage
          forceOriginalDimensions={false}
          {...props}
          src={icon.img}
        />
      );
    } else if (icon.svg) {
      return <svg {...props} dangerouslySetInnerHTML={{ __html: icon.svg }} />;
    } else {
      return (
        <svg {...props}>
          <path d={icon.path} />
        </svg>
      );
    }
  }
}

const Icon = sys(
  {
    is: BaseIcon,
  },
  props => ({
    flexShrink: 0, // ensure the icon doesn't shrink when in a flex context
  }),
  "space",
  "color",
);

export default Tooltipify(Icon);
