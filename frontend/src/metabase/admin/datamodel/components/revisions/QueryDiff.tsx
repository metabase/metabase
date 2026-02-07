import { Component } from "react";

import { QueryDefinition } from "metabase/admin/datamodel/components/QueryDefinition";
import CS from "metabase/css/core/index.css";

interface QueryDiffProps {
  diff: {
    before?: any;
    after?: any;
  };
  tableId: number;
}

export class QueryDiff extends Component<QueryDiffProps> {
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
