/*eslint-env node */

import React, { Component } from "react";
import PropTypes from "prop-types";

import { diffWords } from "diff";

export default class TextDiff extends Component {
  static propTypes = {
    diff: PropTypes.object.isRequired,
  };

  render() {
    const {
      diff: { before, after },
    } = this.props;
    return (
      <div>
        &quot;
        {before != null && after != null ? (
          diffWords(before, after).map((section, index) => (
            <span key={index}>
              {section.added ? (
                <strong>{section.value}</strong>
              ) : section.removed ? (
                <span style={{ textDecoration: "line-through" }}>
                  {section.value}
                </span>
              ) : (
                <span>{section.value}</span>
              )}{" "}
            </span>
          ))
        ) : before != null ? (
          <span style={{ textDecoration: "line-through" }}>{before}</span>
        ) : (
          <strong>{after}</strong>
        )}
        &quot;
      </div>
    );
  }
}
