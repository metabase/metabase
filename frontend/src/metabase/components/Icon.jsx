/*eslint-disable react/no-danger */

import React, { Component } from "react";
import RetinaImage from "react-retina-image";
import styled from "styled-components";
import { color, space, hover } from "styled-system";
import cx from "classnames";

import { loadIcon } from "metabase/icon_paths";
import { stripLayoutProps } from "metabase/lib/utils";

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
    const className = cx(
      icon.attrs && icon.attrs.className,
      this.props.className,
    );
    const props = { ...icon.attrs, ...this.props, className };
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
        <svg {...stripLayoutProps(props)}>
          <path d={icon.path} />
        </svg>
      );
    }
  }
}

const Icon = styled(BaseIcon)`
  ${space}
  ${color}
  ${hover}
  flex-shrink: 0
`;
export default Tooltipify(Icon);
