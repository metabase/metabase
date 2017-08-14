import React from 'react'
import Visualization from 'metabase/visualizations/components/Visualization'

import { normal } from 'metabase/lib/colors'

const Histogram = ({ histogram, color, showAxis }) =>
    <Visualization
        className="full-height"
        series={[
            {
                card: {
                    display: "bar",
                    visualization_settings: {
                        "graph.colors": [color],
                        "graph.x_axis.axis_enabled": showAxis,
                        "graph.x_axis.labels_enabled": showAxis,
                        "graph.y_axis.axis_enabled": showAxis,
                        "graph.y_axis.labels_enabled": showAxis
                    }
                },
                data: histogram
            }
        ]}
        showTitle={false}
    />

Histogram.defaultProps = {
    color: normal.blue,
    showAxis: true
}

export default Histogram

