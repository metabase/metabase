import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import cx from "classnames";
import styles from "./Funnel.css";

import { getFriendlyName } from "metabase/visualizations/lib/utils";
import { formatValue } from "metabase/lib/formatting";
import { ChartSettingsError } from "metabase/visualizations/lib/errors";

import _ from "underscore";

export default class Funnel extends Component {
    static displayName = "Funnel";
    static identifier = "funnel";
    static iconName = "funnel";

    static minSize = {
        width: 4,
        height: 5
    };

    static propTypes = {
        data: PropTypes.object.isRequired
    };

    static defaultProps = {
        className: ""
    };

    constructor(props, context) {
        super(props, context);

        this.state = {}
    }

    static isSensible(cols, rows) {
        return cols.length === 2;
    }

    static checkRenderable(cols, rows, settings) {
        if (!settings["funnel.metric"] || !settings["funnel.step"]) {
            throw new ChartSettingsError("Please select columns in the chart settings.", "Data");
        }
    }

    componentDidUpdate() {
    //     // let headerHeight = ReactDOM.findDOMNode(this.refs.header).getBoundingClientRect().height;
    //     // let footerHeight = this.refs.footer ? ReactDOM.findDOMNode(this.refs.footer).getBoundingClientRect().height : 0;
    //     // let rowHeight = ReactDOM.findDOMNode(this.refs.firstRow).getBoundingClientRect().height + 1;
    //     // let pageSize = Math.max(1, Math.floor((this.props.height - headerHeight - footerHeight) / rowHeight));
    //     // if (this.state.pageSize !== pageSize) {
    //     //     this.setState({ pageSize });
    //     // }
    }

    render() {
        const { data, settings } = this.props;
        let { rows, cols } = data;

        var infos = calculateStepsInfos(cols, rows, settings);
        var containerStyle = {
            width: `${100 / infos.length}%`,
        }

        return (
            <div className="p1 flex-full">
                {infos.map((info, infoIndex) =>
                    <div key={infoIndex}
                        className={styles.FunnelStep}
                        style={containerStyle}>
                        <div className={styles.Head}>
                            {info.label}
                        </div>
                        <div className={styles.Graph} style={calculateGraphStyle(info, infoIndex, infos.length)}>
                            {formatValue(info.value)}
                        </div>
                        <div className={styles.Infos}>&nbsp;
                            <em>{ info.partialLost > 0 ? `${formatValue(-info.partialLost)}% step` : null}</em>&nbsp;<br/>
                            <strong>{ info.totalLost > 0 ? `${formatValue(-info.totalLost)}% total` : null}</strong>&nbsp;<br/>
                        </div>
                    </div>
                )}
            </div>
        );
    }
}

function calculateStepsInfos(cols, rows, settings) {
    const stepIndex = _.findIndex(cols, (col) => col.name === settings["funnel.step"]);
    const metricIndex = _.findIndex(cols, (col) => col.name === settings["funnel.metric"]);

    // Initial infos (required for step calculation)
    var infos = [{
        value: rows[0][metricIndex],
        graph: {
            startBottom: 0.0,
            startTop: 1.0,
            endBottom: 0.0,
            endTop: 1.0,
        }
    }];

    var remaning = rows[0][1];

    rows.map((row, rowIndex) => {
        remaning -= (infos[rowIndex].value - row[metricIndex]);

        infos[rowIndex + 1] = {
            label: row[stepIndex],
            value: row[metricIndex],
            partialLost: (infos[rowIndex].value - row[metricIndex]) / infos[rowIndex].value * 100,
            totalLost: (infos[0].value - remaning) / infos[0].value * 100,
            graph: {
                startBottom: infos[rowIndex].graph.endBottom,
                startTop: infos[rowIndex].graph.endTop,
                endTop: 0.5 + ((remaning / infos[0].value) / 2),
                endBottom: 0.5 - ((remaning / infos[0].value) / 2),
            }
        }
    });

    // Remove initial setup
    infos.shift();

    return infos;
}

function calculateGraphStyle(info, currentStep, stepsNumber) {
    var sizeConverter = 100;
    var opacityStep = 0.6 / stepsNumber;

    var style = {
        WebkitClipPath: `polygon(0 ${info.graph.startBottom * sizeConverter}%, 0 ${info.graph.startTop * sizeConverter}%, 100% ${info.graph.endTop * sizeConverter}%, 100% ${info.graph.endBottom * sizeConverter}%)`,
        MozClipPath: `polygon(0 ${info.graph.startBottom * sizeConverter}%, 0 ${info.graph.startTop * sizeConverter}%, 100% ${info.graph.endTop * sizeConverter}%, 100% ${info.graph.endBottom * sizeConverter}%)`,
        msClipPath: `polygon(0 ${info.graph.startBottom * sizeConverter}%, 0 ${info.graph.startTop * sizeConverter}%, 100% ${info.graph.endTop * sizeConverter}%, 100% ${info.graph.endBottom * sizeConverter}%)`,
        ClipPath: `polygon(0 ${info.graph.startBottom * sizeConverter}%, 0 ${info.graph.startTop * sizeConverter}%, 100% ${info.graph.endTop * sizeConverter}%, 100% ${info.graph.endBottom * sizeConverter}%)`,
        backgroundColor: `rgba(80, 158, 227, ${1 - ((currentStep - 1) * opacityStep)})`,
    };

    if (currentStep == 0) {
        style.color = '#727479';
        style.backgroundColor = 'transparent';
        style.textAlign = 'right';
        style.padding = '0.5em';
    }

    return style;
}
