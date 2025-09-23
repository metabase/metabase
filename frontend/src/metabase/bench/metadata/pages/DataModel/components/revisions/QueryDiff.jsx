import PropTypes from "prop-types";
import { Component } from "react";

import { QueryDefinition } from "../QueryDefinition";
import CS from "metabase/css/core/index.css";

export default class QueryDiff extends Component {
  static propTypes = {
    diff: PropTypes.object.isRequired,
    tableId: PropTypes.number.isRequired,
  };

  render() {
    const {
      diff: { before, after },
      tableId,
    } = this.props;
    const definition = after || before;
    return (
      <QueryDefinition
        className={CS.my1}
        definition={definition}
        tableId={tableId}
      />
    );
  }
}
