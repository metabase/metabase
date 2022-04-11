/* eslint-disable react/prop-types */
import React from "react";
import cx from "classnames";
import CopyToClipboard from "react-copy-to-clipboard";
import Subhead from "metabase/components/type/Subhead";

import colors, { harmony } from "metabase/lib/colors";

import withToast from "metabase/hoc/Toast";
import {
  ColorsList,
  ColorsSection,
  ColorSwatchRoot,
} from "./ColorsPage.styled";

const SWATCH_SIZE = 150;

class ColorSwatch extends React.Component {
  render() {
    const { color, name } = this.props;

    return (
      <ColorSwatchRoot
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
      </ColorSwatchRoot>
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
    <ColorsSection>
      <Subhead className="mb2">App colors</Subhead>
      <ColorsList>
        {Object.entries(colors).map(([name, color]) => (
          <ColorSwatch key={name} color={color} name={name} />
        ))}
      </ColorsList>
    </ColorsSection>
    <div>
      <Subhead className="mb2">Chart colors</Subhead>
      <ColorsList>
        {harmony.map((color, index) => (
          <ColorSwatch key={index} color={color} name={`Series ${index + 1}`} />
        ))}
      </ColorsList>
    </div>
    <ColorsSection>
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
    </ColorsSection>
  </div>
);

export default ColorsPage;
