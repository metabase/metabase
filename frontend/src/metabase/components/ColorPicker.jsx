import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import { normal } from "metabase/lib/colors";

const COLOR_SQUARE_SIZE = 32;
const COLOR_SQUARE = {
    width: COLOR_SQUARE_SIZE,
    height: COLOR_SQUARE_SIZE
};

const ColorSquare = ({ color }) =>
    <div style={{
        ...COLOR_SQUARE,
        backgroundColor: color,
        borderRadius: 4
    }}></div>

class ColorPicker extends Component {
    static defaultProps = {
        colors: [...Object.values(normal)],
        padding: 4
    }

    static propTypes = {
        colors: PropTypes.array,
        onChange: PropTypes.func.isRequired,
        value: PropTypes.string
    }

    render () {
        const { colors, onChange, padding, value } = this.props;
        return (
            <div className="inline-block">
                <PopoverWithTrigger
                    ref="colorPopover"
                    triggerElement={
                        <div className="bordered p1 rounded flex align-center">
                            <ColorSquare color={value} />
                            <Icon
                                className="ml1"
                                name="chevrondown"
                            />
                        </div>
                    }
                >
                    <div className="p1">
                        <ol
                            className="flex flex-wrap"
                            style={{
                                maxWidth: 120
                            }}
                        >
                            { colors.map((color, index) =>
                                <li
                                    className="cursor-pointer"
                                    style={{ padding }}
                                    key={index}
                                    onClick={() => {
                                        onChange(color);
                                        this.refs.colorPopover.close();
                                    }}
                                >
                                    <ColorSquare color={color} />
                                </li>
                            )}
                        </ol>
                    </div>
                </PopoverWithTrigger>
            </div>
        );
    }
}

export default ColorPicker;
