import PropTypes from "prop-types";
import { Component } from "react";

import { QueryDefinition } from "metabase/admin/datamodel/components/QueryDefinition";
import CS from "metabase/css/core/index.css";

export class QueryDiff extends Component {
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
