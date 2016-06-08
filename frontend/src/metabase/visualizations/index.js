
import Scalar     from "./Scalar.jsx";
import Table      from "./Table.jsx";
import LineChart  from "./LineChart.jsx";
import BarChart   from "./BarChart.jsx";
import PieChart   from "./PieChart.jsx";
import AreaChart  from "./AreaChart.jsx";
import USStateMap from "./USStateMap.jsx";
import WorldMap   from "./WorldMap.jsx";
import PinMap     from "./PinMap.jsx";

const visualizations = new Map();
visualizations.get = function(key) {
    return Map.prototype.get.call(this, key) || Table;
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
}

registerVisualization(Scalar);
registerVisualization(Table);
registerVisualization(LineChart);
registerVisualization(BarChart);
registerVisualization(PieChart);
registerVisualization(AreaChart);
registerVisualization(USStateMap);
registerVisualization(WorldMap);
registerVisualization(PinMap);


import { enableVisualizationEasterEgg } from "./lib/utils";
import XKCDChart from "./XKCDChart.jsx";
import LineAreaBarChart from "./components/LineAreaBarChart.jsx";
enableVisualizationEasterEgg("XKCD", LineAreaBarChart, XKCDChart);

export default visualizations;
