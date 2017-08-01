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
                data: {
                    rows: fingerprint.histogram,
                    cols: [
                        fingerprint.field,
                        {
                            name: "Count",
                            base_type: "type/Integer"
                        },
                    ]
                }

            }
        ]}
        showTitle={false}
    />

export default Histogram

