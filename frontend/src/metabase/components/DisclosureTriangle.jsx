import React from "react";
import { Motion, spring, presets } from "react-motion";

import Icon from "metabase/components/Icon";

const DisclosureTriangle = ({ open }) => (
  <Motion
    defaultStyle={{ deg: 0 }}
    style={{
      deg: open ? spring(0, presets.gentle) : spring(-90, presets.gentle),
    }}
  >
    {motionStyle => (
      <Icon
        className="ml1 mr1"
        name="expand_arrow"
        style={{
          transform: `rotate(${motionStyle.deg}deg)`,
        }}
      />
    )}
  </Motion>
);

export default DisclosureTriangle;
