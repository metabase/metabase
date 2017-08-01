import React from 'react'
import Visualization from 'metabase/visualizations/components/Visualization'

const Histogram = ({ fingerprint }) =>
    <Visualization
        className="full-height"
        series={[
            {
                card: {
                    display: "bar",
                    visualization_settings: {}
                },
                data: fingerprint.histogram
            }
        ]}
        showTitle={false}
    />

export default Histogram

