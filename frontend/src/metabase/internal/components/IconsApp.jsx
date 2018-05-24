/* @flow */

import React, { Component } from "react";

import Icon from "metabase/components/Icon.jsx";

const SIZES = [12, 16];

type Props = {};
type State = {
  size: number,
};

export default class IconsApp extends Component {
  props: Props;
  state: State = {
    size: 32,
  };
  render() {
    let sizes = SIZES.concat(this.state.size);
    return (
      <table className="Table m4" style={{ width: "inherit" }}>
        <thead>
          <tr>
            <th>Name</th>
            {sizes.map((size, index) => (
              <th>
                <div>{size}px</div>
                {index === SIZES.length && (
                  <input
                    style={{ width: 60 }}
                    type="range"
                    value={this.state.size}
                    max={64}
                    onChange={e => this.setState({ size: e.target.value })}
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.keys(require("metabase/icon_paths").ICON_PATHS).map(name => (
            <tr>
              <td>{name}</td>
              {sizes.map(size => (
                <td>
                  <Icon name={name} size={size} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
}
