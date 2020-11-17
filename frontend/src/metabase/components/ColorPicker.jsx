import React, { Component } from "react";
import PropTypes from "prop-types";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Button from "metabase/components/Button";

import { SketchPicker } from "react-color";

import { normal } from "metabase/lib/colors";

const DEFAULT_COLOR_SQUARE_SIZE = 32;

const ColorSquare = ({ color, size }) => (
  <div
    style={{
      width: size,
      height: size,
      backgroundColor: color,
      borderRadius: size / 8,
    }}
  />
);

class ColorPicker extends Component {
  static defaultProps = {
    size: DEFAULT_COLOR_SQUARE_SIZE,
    triggerSize: DEFAULT_COLOR_SQUARE_SIZE,
    padding: 4,
  };

  static propTypes = {
    colors: PropTypes.array,
    onChange: PropTypes.func.isRequired,
    size: PropTypes.number,
    triggerSize: PropTypes.number,
    value: PropTypes.string,
  };

  render() {
    const { onChange, padding, size, triggerSize, value, fancy } = this.props;
    const colors = this.props.colors || Object.values(normal).slice(0, 9);
    return (
      <div className="inline-block">
        <PopoverWithTrigger
          ref="colorPopover"
          triggerElement={
            <div
              className="bordered rounded flex align-center"
              style={{ padding: triggerSize / 4 }}
            >
              <ColorSquare color={value} size={triggerSize} />
            </div>
          }
        >
          {fancy ? (
            <div>
              {/* HACK to hide SketchPicker's border/shadow */}
              <div className="rounded overflow-hidden">
                <SketchPicker
                  color={value}
                  onChangeComplete={color => {
                    onChange(color.hex);
                  }}
                />
              </div>
              <div className="p1 border-top">
                <Button onClick={() => this.refs.colorPopover.close()}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <div className="p1">
              <ol
                className="flex flex-wrap"
                style={{
                  maxWidth: 120,
                }}
              >
                {colors.map((color, index) => (
                  <li
                    className="cursor-pointer"
                    style={{ padding }}
                    key={index}
                    onClick={() => {
                      onChange(color);
                      this.refs.colorPopover.close();
                    }}
                  >
                    <ColorSquare color={color} size={size} />
                  </li>
                ))}
              </ol>
            </div>
          )}
        </PopoverWithTrigger>
      </div>
    );
  }
}

export default ColorPicker;
