import React from 'react'
import Visualization from 'metabase/visualizations/components/Visualization'

const Histogram = ({ histogram, color }) =>
    <Visualization
        className="full-height"
        series={[
            {
                card: {
                    display: "bar",
                    visualization_settings: {
                        "graph.colors": [color]
                    }
                },
                data: histogram
            }
        ]}
        showTitle={false}
    />

export default Histogram

