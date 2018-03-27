/* @flow */

import React from "react";
import cx from "classnames";

import { normal, saturated, harmony } from "metabase/lib/colors";

const SWATCH_SIZE = 200;
const ColorSwatch = ({ color, name }) => (
  <div
    style={{
      backgroundColor: color,
      height: SWATCH_SIZE,
      borderRadius: 12,
      width: SWATCH_SIZE,
    }}
    className="p3 mr2 mb2"
  >
    {name}
    <h2>{color}</h2>
  </div>
);

// eslint-disable-next-line import/no-commonjs
let colorStyles = require("!style-loader!css-loader?modules!postcss-loader!metabase/css/core/colors.css");

const ColorsApp = () => (
  <div className="wrapper">
    <div className="my2">
      <h2 className="my3">Normal</h2>
      <div className="flex flex-wrap">
        {Object.entries(normal).map(([name, value]) => (
          <ColorSwatch color={value} name={name} />
        ))}
      </div>
    </div>
    <div className="my2">
      <h2 className="my3">Saturated</h2>
      <div className="flex flex-wrap">
        {Object.entries(saturated).map(([name, value]) => (
          <ColorSwatch color={value} name={name} />
        ))}
      </div>
    </div>
    <div className="my2">
      <h2 className="my3">Chart colors</h2>
      <div className="flex flex-wrap">
        {harmony.map((color, index) => (
          <ColorSwatch color={color} name={`Series ${index + 1}`} />
        ))}
      </div>
    </div>
    <div className="my2">
      <h2 className="my3">CSS colors</h2>
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
    </div>
  </div>
);

export default ColorsApp;
