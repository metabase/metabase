import React from "react";
import cx from "classnames";
import { Box, Flex } from "grid-styled";
import CopyToClipboard from "react-copy-to-clipboard";
import Subhead from "metabase/components/Subhead";

import { normal, saturated, harmony } from "metabase/lib/colors";

import withToast from "metabase/hoc/Toast";

const SWATCH_SIZE = 150;

@withToast
class ColorSwatch extends React.Component {
  render() {
    const { color, name, triggerToast } = this.props;
    return (
      <CopyToClipboard
        text={color}
        onCopy={() => triggerToast(`${color} copied to clipboard`)}
      >
        <Box
          w={SWATCH_SIZE}
          style={{
            backgroundColor: color,
            height: SWATCH_SIZE,
            borderRadius: 12,
            width: SWATCH_SIZE,
            color: "white",
          }}
          className="p3 mr2 mb2 cursor-pointer"
        >
          {name}
          <h2>{color}</h2>
        </Box>
      </CopyToClipboard>
    );
  }
}

// eslint-disable-next-line import/no-commonjs
let colorStyles = require("!style-loader!css-loader?modules!postcss-loader!metabase/css/core/colors.css");

const ColorsApp = () => (
  <div className="wrapper">
    <Box my={2}>
      <Subhead my={3}>Normal</Subhead>
      <Flex wrap>
        {Object.entries(normal).map(([name, value]) => (
          <ColorSwatch color={value} name={name} />
        ))}
      </Flex>
    </Box>
    <Box my={2}>
      <Subhead my={3}>Saturated</Subhead>
      <Flex wrap>
        {Object.entries(saturated).map(([name, value]) => (
          <ColorSwatch color={value} name={name} />
        ))}
      </Flex>
    </Box>
    <Box my={2}>
      <Subhead my={3}>Chart colors</Subhead>
      <Flex wrap>
        {harmony.map((color, index) => (
          <ColorSwatch color={color} name={`Series ${index + 1}`} />
        ))}
      </Flex>
    </Box>
    <Box my={2}>
      <Subhead>CSS Colors</Subhead>
      {Object.entries(colorStyles).map(([name, className]) => (
        <div
          className={cx(className, "rounded px1")}
          style={{
            paddingTop: "0.25em",
            paddingBottom: "0.25em",
            marginBottom: "0.25em",
          }}
        >
          {name}
        </div>
      ))}
    </Box>
  </div>
);

export default ColorsApp;
