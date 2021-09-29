/* eslint-disable react/prop-types */
import React from "react";
import cx from "classnames";
import { Box, Flex } from "grid-styled";
import CopyToClipboard from "react-copy-to-clipboard";
import Subhead from "metabase/components/type/Subhead";

import colors, { harmony } from "metabase/lib/colors";

import withToast from "metabase/hoc/Toast";

const SWATCH_SIZE = 150;

class ColorSwatch extends React.Component {
  render() {
    const { color, name } = this.props;

    return (
      <Flex
        align="center"
        justify="center"
        flexDirection="column"
        mr={2}
        mb={2}
        px={1}
        py={2}
        style={{
          backgroundColor: color,
          height: SWATCH_SIZE,
          width: SWATCH_SIZE,
          borderRadius: 12,
          color: "white",
        }}
      >
        <Copy text={`colors[${JSON.stringify(name)}]`}>{name}</Copy>
        <Copy text={color}>
          <h2>{color}</h2>
        </Copy>
      </Flex>
    );
  }
}

const Copy = withToast(({ text, children, triggerToast }) => (
  <CopyToClipboard
    text={text}
    onCopy={() => triggerToast(`${text} copied to clipboard`)}
  >
    <span className="cursor-pointer">{children}</span>
  </CopyToClipboard>
));

// eslint-disable-next-line import/no-commonjs
const colorStyles = require("!style-loader!css-loader?modules!postcss-loader!metabase/css/core/colors.css");

const ColorsPage = () => (
  <div className="wrapper">
    <Box my={2}>
      <Subhead className="mb2">App colors</Subhead>
      <Flex wrap>
        {Object.entries(colors).map(([name, color]) => (
          <ColorSwatch key={name} color={color} name={name} />
        ))}
      </Flex>
    </Box>
    <Box>
      <Subhead className="mb2">Chart colors</Subhead>
      <Flex wrap>
        {harmony.map((color, index) => (
          <ColorSwatch key={index} color={color} name={`Series ${index + 1}`} />
        ))}
      </Flex>
    </Box>
    <Box my={2}>
      <Subhead className="mb2">CSS Colors</Subhead>
      {Object.entries(colorStyles).map(([name, className]) => (
        <div
          key={name}
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

export default ColorsPage;
