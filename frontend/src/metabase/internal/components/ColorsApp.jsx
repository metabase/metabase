/* @flow */
import React from "react";
import cx from "classnames";
import { connect } from "react-redux";
import CopyToClipboard from "react-copy-to-clipboard";

import { addUndo, createUndo } from "metabase/redux/undo";
import { normal, saturated, harmony } from "metabase/lib/colors";

const SWATCH_SIZE = 150;

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
      <CopyToClipboard value={color} onCopy={() => this._onCopy(color)}>
        <div
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
        </div>
      </CopyToClipboard>
    );
  }
}

// eslint-disable-next-line import/no-commonjs
let colorStyles = require("!style-loader!css-loader?modules!postcss-loader!metabase/css/core/colors.css");

const ColorsApp = () => (
  <div className="wrapper">
    <div className="my2">
      <h2 className="my3">Normal</h2>
      <div className="flex flex-wrap">
        {Object.entries(normal).map(([name, value]) => (
          <ColorSwatch color={value} name={name} key={`noraml-${name}`} />
        ))}
      </div>
    </div>
    <div className="my2">
      <h2 className="my3">Saturated</h2>
      <div className="flex flex-wrap">
        {Object.entries(saturated).map(([name, value]) => (
          <ColorSwatch color={value} name={name} key={`saturated-${name}`} />
        ))}
      </div>
    </div>
    <div className="my2">
      <h2 className="my3">Chart colors</h2>
      <div className="flex flex-wrap">
        {harmony.map((color, index) => (
          <ColorSwatch color={color} name={`Series ${index + 1}`} key={index} />
        ))}
      </div>
    </div>
    <div className="my2">
      <h2 className="my3">CSS colors</h2>
      {Object.entries(colorStyles).map(([name, className]) => (
        <div
          className={cx(className, "rounded px1")}
          key={className}
          style={{
            paddingTop: "0.25em",
            paddingBottom: "0.25em",
            marginBottom: "0.25em",
          }}
        >
          {name}
        </div>
      ))}
    </div>
  </div>
);

export default ColorsApp;
