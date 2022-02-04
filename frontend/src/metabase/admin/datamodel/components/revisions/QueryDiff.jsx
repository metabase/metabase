import React from "react";
import PropTypes from "prop-types";

import QueryDefinition from "metabase/query_builder/components/QueryDefinition";

export default class QueryDiff extends React.Component {
  static propTypes = {
    diff: PropTypes.object.isRequired,
  };

  render() {
    const {
      diff: { before, after },
    } = this.props;
    const definition = after || before;
    return <QueryDefinition className="my1" object={{ definition }} />;
  }
}
