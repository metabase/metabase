import React, { Component, PropTypes } from "react";
import _ from "underscore";

import Visualization from "metabase/visualizations/components/Visualization.jsx";


export default class VirtualTablePreview extends Component {

    shouldComponentUpdate(nextProps, nextState) {
        // NOTE: we are using object equality here on purpose
        return nextProps.previewData != this.props.previewData;
    }

    render() {
        const { previewData, virtualTable } = this.props;

        if (previewData) {
            return (
                <Visualization
                    series={[{card: {display: "table", dataset_query: {type: "query", query: {aggregation: ["rows"]}}}, data: previewData.data}]}
                    card={{display: "table", dataset_query: {type: "query", query: {aggregation: ["rows"]}}}}
                    data={previewData.data}
                />
            );

        } else {
            /* This just renders a simple empty table as a placeholder until we actually have data to show */
            return (
                <table style={{borderSpacing: 0, width: "100%", height: "100%"}} className="full border-left border-top">
                    <tbody>
                        { _.range(10).map((j, idx1) => 
                            <tr key={"r"+idx1}>
                                { _.range(10).map((k, idx2) =>
                                    <td key={"c"+idx2} className="p1 border-right border-bottom">&nbsp;</td>
                                )}
                            </tr>
                        )}
                    </tbody>
                </table>
            );
        }
    }
}
