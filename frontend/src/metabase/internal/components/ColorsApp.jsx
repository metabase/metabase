import React from "react";
import cx from "classnames";
import { Box, Flex } from "grid-styled";
import CopyToClipboard from "react-copy-to-clipboard";
import Subhead from "metabase/components/Subhead";

import colors, { harmony, alpha, lighten, darken } from "metabase/lib/colors";

import withToast from "metabase/hoc/Toast";

const SWATCH_SIZE = 150;

const INITIAL_ALPHA = 1;
const INITIAL_LIGHTEN = 0;
const INITIAL_DARKEN = 0;

class ColorSwatch extends React.Component {
  state = {
    a: INITIAL_ALPHA,
    l: INITIAL_LIGHTEN,
    d: INITIAL_DARKEN,
  };

  render() {
    const { color, name } = this.props;
    const { a, l, d } = this.state;

    let colorVariant = color;
    if (a !== INITIAL_ALPHA) {
      colorVariant = alpha(colorVariant, a);
    }
    if (l !== INITIAL_LIGHTEN) {
      colorVariant = lighten(colorVariant, l);
    }
    if (d !== INITIAL_DARKEN) {
      colorVariant = darken(colorVariant, d);
    }
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
          backgroundColor: colorVariant,
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
        <Controls>
          <VariantControl
            name={name}
            variant="alpha"
            initial={1}
            value={a}
            onChange={a => this.setState({ a })}
          />
          <VariantControl
            name={name}
            variant="lighten"
            initial={0}
            value={l}
            onChange={l => this.setState({ l })}
          />
          <VariantControl
            name={name}
            variant="darken"
            initial={0}
            value={d}
            onChange={d => this.setState({ d })}
          />
        </Controls>
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

const Controls = ({ children }) => (
  <table>
    <tbody>{children}</tbody>
  </table>
);

const VariantControl = ({ name, variant, value, initial, onChange }) => (
  <tr className="text-small" style={{ opacity: value !== initial ? 1 : 0.2 }}>
    <td>
      <Copy
        text={`${variant}(${JSON.stringify(name)}, ${JSON.stringify(value)})`}
      >
        {variant.replace(/en$/, "")}
      </Copy>
    </td>
    <td style={{ position: "relative" }}>
      <input
        style={{ width: "100%" }}
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
      />
    </td>
    <td>{value.toFixed(2)}</td>
  </tr>
);

// eslint-disable-next-line import/no-commonjs
const colorStyles = require("!style-loader!css-loader?modules!postcss-loader!metabase/css/core/colors.css");

const ColorsApp = () => (
  <div className="wrapper">
    <Box my={2}>
      <Subhead className="mb2">App colors</Subhead>
      <Flex wrap>
        {Object.entries(colors).map(([name, color], index) => (
          <ColorSwatch color={color} name={name} />
        ))}
      </Flex>
    </Box>
    <Box>
      <Subhead className="mb2">Chart colors</Subhead>
      <Flex wrap>
        {harmony.map((color, index) => (
          <ColorSwatch color={color} name={`Series ${index + 1}`} />
        ))}
      </Flex>
    </Box>
    <Box my={2}>
      <Subhead className="mb2">CSS Colors</Subhead>
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
