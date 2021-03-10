import React, { Component } from "react";

import LoginHistory from "metabase/entities/loginHistory";

const LoginHistoryItem = (item) => {
  console.log("item:", item); // NOCOMMIT
  return (
    <li className="mx3 my3">
    {item.timestamp}
    {item.location.description}
    </li>
  );
}

@LoginHistory.loadList()
export default class LoginHistoryList extends Component {
  render() {
    console.log("this.props:", this.props); // NOCOMMIT
    console.log("this.state:", this.state); // NOCOMMIT

    const { loginHistory } = this.props;

    return (
      <div>
        {(loginHistory || []).map(LoginHistoryItem)}
      </div>
    );
  }
}
