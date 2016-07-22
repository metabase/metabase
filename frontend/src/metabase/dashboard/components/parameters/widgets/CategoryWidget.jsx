/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

const CategoryWidget = ({ value, values, setValue, onClose }) =>
    <ul className="scroll-y scroll-show" style={{ maxWidth: 200, maxHeight: 300 }}>
        {values.map(value =>
            <li
                key={value}
                className="px2 py1 bg-brand-hover text-white-hover cursor-pointer"
                onClick={() => { setValue(value); onClose(); }}
            >
                {value}
            </li>
        )}
    </ul>

CategoryWidget.format = (value) => value;

CategoryWidget.propTypes = {
    value: PropTypes.any,
    values: PropTypes.array.isRequired,
    setValue: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired
};

export default CategoryWidget;
