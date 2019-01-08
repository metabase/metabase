import React from "react";

import QuerySections from "../worksheet/QuerySections";

export default class QueryPanel extends React.Component {
  render() {
    return <QuerySections {...this.props} />;
  }
}
