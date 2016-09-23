
import Scalar     from "./Scalar.jsx";
import Progress   from "./Progress.jsx";
import Table      from "./Table.jsx";
import LineChart  from "./LineChart.jsx";
import BarChart   from "./BarChart.jsx";
import PieChart   from "./PieChart.jsx";
import AreaChart  from "./AreaChart.jsx";
import MapViz     from "./Map.jsx";
import ScatterPlot from "./ScatterPlot.jsx";

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

registerVisualization(Scalar);
registerVisualization(Progress);
registerVisualization(Table);
registerVisualization(LineChart);
registerVisualization(BarChart);
registerVisualization(AreaChart);
registerVisualization(ScatterPlot);
registerVisualization(PieChart);
registerVisualization(MapViz);

import { enableVisualizationEasterEgg } from "./lib/utils";
import XKCDChart from "./XKCDChart.jsx";
import LineAreaBarChart from "./components/LineAreaBarChart.jsx";
enableVisualizationEasterEgg("XKCD", LineAreaBarChart, XKCDChart);

export default visualizations;
