import React, { Component, PropTypes } from "react";

import { normal } from 'metabase/lib/colors'
const DEFAULT_COLOR_HARMONY = Object.values(normal);

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";

export default class ChartSettingColorPicker extends Component {
    render() {
        const { value, onChange, title } = this.props;
        return (
            <div className="flex align-center">
                <PopoverWithTrigger
                    ref="colorPopover"
                    hasArrow={false}
                    tetherOptions={{
                        attachment: 'middle left',
                        targetAttachment: 'middle right',
                        targetOffset: '0 0',
                        constraints: [{ to: 'window', attachment: 'together', pin: ['left', 'right']}]
                    }}
                    triggerElement={
                        <span className="ml1 mr2 bordered inline-block cursor-pointer" style={{ padding: 4, borderRadius: 3 }}>
                            <div style={{ width: 15, height: 15, backgroundColor: value }} />
                        </span>
                    }
                >
                    <ol className="p1">
                        {DEFAULT_COLOR_HARMONY.map((color, colorIndex) =>
                            <li
                                key={colorIndex}
                                className="CardSettings-colorBlock"
                                style={{ backgroundColor: color }}
                                onClick={() => {
                                    onChange(color);
                                    this.refs.colorPopover.close();
                                }}
                            ></li>
                        )}
                    </ol>
                </PopoverWithTrigger>

                <span className="text-bold">{title}</span>
            </div>
        );
    }
}
