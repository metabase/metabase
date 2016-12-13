import React, { Component } from "react";

import Icon from "metabase/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import { normal, saturated, desaturated } from "metabase/lib/colors";

const COLORS = [
    ...Object.values(normal),
    ...Object.values(saturated),
    ...Object.values(desaturated),
];

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
    render () {
        const { value, onChange } = this.props;
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
                    <ol className="flex p1">
                        { COLORS.map((color, index) =>
                            <li
                                className="cursor-pointer mr1 mb1"
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
                </PopoverWithTrigger>
            </div>
        );
    }
}

export default ColorPicker;
