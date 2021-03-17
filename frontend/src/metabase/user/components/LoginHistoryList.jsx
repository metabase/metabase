import React, { Component } from "react";

import LoginHistory from "metabase/entities/loginHistory";

const LoginHistoryItemRow = item => {
  return (
    <tr>
      <td>
        <tt>{item.timestamp}</tt>
      </td>
      <td>{item.location && item.location.description}</td>
      <td>
        <tt>{item.device_description}</tt>
      </td>
      <td>{item.active ? "✅" : "❌"}</td>
    </tr>
  );
};

@LoginHistory.loadList()
export default class LoginHistoryList extends Component {
  render() {
    const { loginHistory } = this.props;

    return (
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Location</th>
            <th>Device description</th>
            <th>Active?</th>
          </tr>
        </thead>

        <tbody>{(loginHistory || []).map(LoginHistoryItemRow)}</tbody>
      </table>
    );
  }
}
