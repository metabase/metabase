import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

const COLORS = ["#4A90E2", "#84BB4C", "#F9CF48", "#ED6E6E", "#885AB1"];

const LegendHeader = ({ card, series, onAddSeries }) =>
    <div className="Card-title my1 flex flex-no-shrink flex-row flex-wrap">
        <LegendItem card={card} index={0} />
        { series && series.map((s, index) =>
            <LegendItem key={index} card={s.card} index={index + 1} />
        )}
        { onAddSeries &&
            <AddSeriesItem onAddSeries={onAddSeries} />
        }
    </div>

const LegendItem = ({ card, index }) =>
    <span key={index} className="h3 mr2 mb1 text-bold flex align-center">
        <span className="inline-block circular" style={{width: 13, height: 13, margin: 4, marginRight: 8, backgroundColor: COLORS[index % COLORS.length]}} />
        <span>{card.name}</span>
    </span>

const AddSeriesItem = ({ onAddSeries }) =>
    <a className="h3 mr2 mb1 cursor-pointer flex align-center text-brand-hover" style={{ pointerEvents: "all" }} onClick={onAddSeries}>
        <span className="circular bordered border-brand flex layout-centered" style={{ width: 20, height: 20, marginRight: 8 }}>
            <Icon className="text-brand" name="add" width={12} height={12} />
        </span>
        <span>Add data</span>
    </a>

export default LegendHeader;
