/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { t } from "ttag";
import d3 from "d3";
import cx from "classnames";

import _ from "underscore";

import { sankey, sankeyLinkHorizontal } from "d3-sankey";
import chroma from "chroma-js";

import { SANKEY_DATA_SETTINGS } from "../lib/settings/graph";

const PADDING_BOTTOM = 10;

export default class Sankey extends Component {
  static uiName = t`Sankey`;
  static identifier = "sankey";
  static iconName = "sankey";

  static minSize = { width: 4, height: 4 };

  static isSensible({ cols, rows }) {
    return rows.length >= 1 && cols.length >= 3;
  }

  static checkRenderable(series, settings) {
    const start = settings["graph.start"];
    const destinations = settings["graph.destinations"];
    for (let i = 0; i < destinations.length; i++) {
      if (destinations[i] === start[0]) {
        throw new Error(t`Start can't be a destination.`);
      }
    }
  }

  state = {
    mounted: false,
  };

  static settings = {
    ...SANKEY_DATA_SETTINGS,
  };

  componentDidMount() {
    this.setState({ mounted: true });
  }
  componentDidUpdate() {}

  getFilteredData(cols, rows, start, destinations, metrics) {
    const dimensions = start.concat(destinations);
    const valueIndex = _.findIndex(cols, col => col.name === metrics[0]);
    const dims = [];
    for (let i = dimensions.length - 1; i >= 0; i--) {
      dims.push(_.findIndex(cols, col => col.name === dimensions[i]));
    }
    const nodes = [];
    rows.map(row => {
      for (let i = 0; i < dimensions.length; i++) {
        if (nodes.findIndex(x => x.name === row[dims[i]]) === -1) {
          nodes.push({ name: row[dims[i]] });
        }
      }
    });

    const links = [];
    for (let i = 0; i < dimensions.length - 1; i++) {
      rows.map((x, index) => {
        links.push({
          target: _.findIndex(nodes, n => n.name === x[dims[i]]),
          source: _.findIndex(nodes, n => n.name === x[dims[i + 1]]),
          value: x[valueIndex],
        });
      });
    }

    const results = {
      nodes: nodes,
      links: links,
    };

    return results;
  }

  render() {
    const {
      series: [
        {
          data: { rows, cols },
        },
      ],
      settings,
      className,
    } = this.props;

    const start = settings["graph.start"];
    const destinations = settings["graph.destinations"];
    const metrics = settings["graph.metrics"];

    const width = this.props.width;
    const height = this.props.height - PADDING_BOTTOM;

    let chart;
    if (start[0] != null && destinations[0] != null && metrics[0] != null) {
      const data = this.getFilteredData(
        cols,
        rows,
        start,
        destinations,
        metrics,
      );
      const { nodes, links } = sankey()
        .nodeWidth(15)
        .nodePadding(10)
        .extent([
          [1, 1],
          [width - 1, height - 5],
        ])(data);

      const color = chroma.scale("Set3").classes(nodes.length);
      const colorScale = d3.scale
        .linear()
        .domain([0, nodes.length])
        .range([0, 1]);

      if (document.body.offsetWidth > 400) {
        chart = (
          <svg width="100%" height="600" ref={this.svgRef}>
            <g style={{ mixBlendMode: "multiply" }}>
              {nodes.map((node, i) => (
                <SankeyNode
                  {...node}
                  color={color(colorScale(i)).hex()}
                  key={node.name}
                />
              ))}
              {nodes.map((node, i) => (
                <SankeyText {...node} key={node.name} />
              ))}
              {links.map((link, i) => (
                <SankeyLink
                  link={link}
                  color={color(colorScale(link.source.index)).hex()}
                  key={links.name}
                />
              ))}
            </g>
          </svg>
        );
      } else {
        chart = (
          <svg width="100%" height="600" ref={this.svgRef}>
            <g style={{ mixBlendMode: "multiply" }}>
              {nodes.map((node, i) => (
                <SankeyNode
                  {...node}
                  color={color(colorScale(i)).hex()}
                  key={node.name}
                />
              ))}
              {links.map((link, i) => (
                <SankeyLink
                  link={link}
                  color={color(colorScale(link.source.index)).hex()}
                  key={links.name}
                />
              ))}
            </g>
          </svg>
        );
      }
    } else {
      chart = (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
          }}
        >
          Sankey diagrams need at least two groupings and one metric.
        </div>
      );
    }

    return (
      <div className={cx(className, "relative")}>
        <div
          className="absolute overflow-hidden"
          style={{
            width: width,
            height: height,
          }}
        >
          {chart}
        </div>
      </div>
    );
  }
}

const SankeyText = ({ name, x0, x1, y0, y1 }) => (
  <text x={x1} y={y0 + (y1 - y0) / 2 + 5} fill={"#000"}>
    {name}
  </text>
);
const SankeyNode = ({ name, x0, x1, y0, y1, color }) => (
  <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill={color}>
    <title>{name}</title>
  </rect>
);

const SankeyLink = ({ link, color }) => (
  <path
    d={sankeyLinkHorizontal()(link)}
    style={{
      fill: "none",
      strokeOpacity: ".3",
      stroke: color,
      strokeWidth: Math.max(1, link.width),
    }}
  >
    <title>
      {link.source.name + "->" + link.target.name + ": " + link.value}
    </title>
  </path>
);
