
import Scalar     from "./Scalar.jsx";
import Progress   from "./Progress.jsx";
import Table      from "./Table.jsx";
import LineChart  from "./LineChart.jsx";
import BarChart   from "./BarChart.jsx";
import PieChart   from "./PieChart.jsx";
import AreaChart  from "./AreaChart.jsx";
import MapViz     from "./Map.jsx";
import ScatterPlot from "./ScatterPlot.jsx";
import Funnel     from "./Funnel.jsx";

import _ from "underscore";

const visualizations = new Map();
const aliases = new Map();
visualizations.get = function(key) {
    return Map.prototype.get.call(this, key) || aliases.get(key) || Table;
}

export function registerVisualization(visualization) {
    let identifier = visualization.identifier;
    if (identifier == null) {
        throw new Error("Visualization must define an 'identifier' static variable: " + visualization.name);
    }
    if (visualizations.has(identifier)) {
        throw new Error("Visualization with that identifier is already registered: " + visualization.name);
    }
    visualizations.set(identifier, visualization);
    for (let alias of visualization.aliases || []) {
        aliases.set(alias, visualization);
    }
}

export function getVisualizationRaw(series) {
    return {
        series: series,
        CardVisualization: visualizations.get(series[0].card.display)
    };
}

export function getVisualizationTransformed(series) {
    // don't transform if we don't have the data
    if (_.any(series, s => s.data == null)) {
        return getVisualizationRaw(series);
    }

    // if a visualization has a transformSeries function, do the transformation until it returns the same visualization / series
    let CardVisualization, lastSeries;
    do {
        CardVisualization = visualizations.get(series[0].card.display);
        lastSeries = series;
        if (typeof CardVisualization.transformSeries === "function") {
            series = CardVisualization.transformSeries(series);
        }
        if (series !== lastSeries) {
            series = [...series];
            series._raw = lastSeries;
        }
    } while (series !== lastSeries);

    return { series, CardVisualization };
}

registerVisualization(Scalar);
registerVisualization(Progress);
registerVisualization(Table);
registerVisualization(LineChart);
registerVisualization(BarChart);
registerVisualization(AreaChart);
registerVisualization(ScatterPlot);
registerVisualization(PieChart);
registerVisualization(MapViz);
registerVisualization(Funnel);

import { enableVisualizationEasterEgg } from "./lib/utils";
import XKCDChart from "./XKCDChart.jsx";
import LineAreaBarChart from "./components/LineAreaBarChart.jsx";
enableVisualizationEasterEgg("XKCD", LineAreaBarChart, XKCDChart);

export default visualizations;
