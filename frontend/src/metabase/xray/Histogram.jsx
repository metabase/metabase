import React from 'react'
import Visualization from 'metabase/visualizations/components/Visualization'

const Histogram = ({ histogram }) =>
    <Visualization
        className="full-height"
        series={[
            {
                card: {
                    display: "bar",
                    visualization_settings: {}
                },
                data: histogram
            }
        ]}
        showTitle={false}
    />

export default Histogram

