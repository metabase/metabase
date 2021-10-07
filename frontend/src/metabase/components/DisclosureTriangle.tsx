/* eslint-disable react/prop-types */
import React from "react";
import { Motion, spring, presets } from "react-motion";

import Icon from "metabase/components/Icon";

type Props = { open: boolean, className: string };

const DisclosureTriangle: React.FC<Props> = ({ open, className }) => (
  <Motion
    defaultStyle={{ deg: 0 }}
    style={{
      deg: open ? spring(0, presets.gentle) : spring(-90, presets.gentle),
    }}
  >
    {motionStyle => (
      <Icon
        className={className}
        name="expand_arrow"
        style={{
          transform: `rotate(${motionStyle.deg}deg)`,
        }}
      />
    )}
  </Motion>
);

export default DisclosureTriangle;
