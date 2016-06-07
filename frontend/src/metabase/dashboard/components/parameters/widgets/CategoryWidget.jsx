import React, { Component, PropTypes } from "react";

const CategoryWidget = ({ value, values, setValue }) =>
    <ul className="scroll-y scroll-show" style={{ maxWidth: 200, maxHeight: 300 }}>
        {values.map(value =>
            <li
                key={value}
                className="px2 py1 bg-brand-hover text-white-hover cursor-pointer"
                onClick={() => setValue(value)}
            >
                {value}
            </li>
        )}
    </ul>

CategoryWidget.format = (value) => value;

export default CategoryWidget;
