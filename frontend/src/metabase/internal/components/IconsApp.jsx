import React, { Component } from "react";

import Icon from "metabase/components/Icon";

const SIZES = [12, 16];

export default class IconsApp extends Component {
  state = {
    size: 32,
    search: "",
  };
  render() {
    const { size, searchText } = this.state;
    const sizes = SIZES.concat(size);
    return (
      <table className="Table m4" style={{ width: "inherit" }}>
        <thead>
          <tr>
            <th>
              <input
                placeholder="Name"
                value={searchText}
                onChange={e => this.setState({ searchText: e.target.value })}
              />
            </th>
            {sizes.map((size, index) => (
              <th>
                <div>{size}px</div>
                {index === SIZES.length && (
                  <input
                    style={{ width: 60 }}
                    type="range"
                    value={size}
                    max={64}
                    onChange={e => this.setState({ size: e.target.value })}
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.keys(require("metabase/icon_paths").ICON_PATHS)
            .filter(name => !searchText || name.indexOf(searchText) >= 0)
            .map(name => (
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
