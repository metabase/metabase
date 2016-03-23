import React, { Component, PropTypes } from "react";

const LegendDot = ({ color }) =>
    <div
        className="flex-no-shrink inline-block circular"
        style={{width: 13, height: 13, margin: 4, marginRight: 8, backgroundColor: color }}
    />

export default LegendDot;
