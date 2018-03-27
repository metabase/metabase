/* @flow */

import React from "react";
import { Box, Flex, Subhead } from "rebass";
import { connect } from "react-redux";
import cx from "classnames";
import CopyToClipboard from "react-copy-to-clipboard";

import { normal, saturated, harmony } from "metabase/lib/colors";

import { addUndo, createUndo } from "metabase/redux/undo";

const SWATCH_SIZE = 200;

const mapDispatchToProps = {
  addUndo,
  createUndo,
};

@connect(() => ({}), mapDispatchToProps)
class ColorSwatch extends React.Component {
  _onCopy(colorValue) {
    const { addUndo, createUndo } = this.props;
    addUndo(
      createUndo({
        type: "copy-color",
        message: <div>Copied {colorValue} to clipboard</div>,
      }),
    );
  }
  render() {
    const { color, name } = this.props;
    return (
      <CopyToClipboard text={color} onCopy={() => this._onCopy(color)}>
        <Box
          w={SWATCH_SIZE}
          style={{
            backgroundColor: color,
            height: SWATCH_SIZE,
            borderRadius: 12,
          }}
          p={3}
          mr={2}
          mb={2}
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
