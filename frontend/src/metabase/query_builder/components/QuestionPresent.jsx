import React from "react";

import QueryVisualization from "../components/QueryVisualization";

export default class QuesitonPresent extends React.Component {
  render() {
    return (
      <div
        ref="viz"
        id="react_qb_viz"
        className="flex z1"
        style={{ transition: "opacity 0.25s ease-in-out" }}
      >
        <QueryVisualization {...this.props} className="full wrapper mb2 z1" />
      </div>
    );
  }
}
