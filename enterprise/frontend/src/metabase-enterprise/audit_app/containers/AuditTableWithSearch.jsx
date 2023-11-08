import React from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon";

import AuditTable from "./AuditTable";
import AuditParameters from "../components/AuditParameters";

import { t } from "ttag";
import { updateIn } from "icepick";

const propTypes = {
  placeholder: PropTypes.string,
  table: PropTypes.object,
};

// AuditTable but with a default search parameter that gets appended to `args`
const AuditTableWithSearch = ({ placeholder = t`Search`, table, ...props }) => (
  <AuditParameters
    parameters={[
      { key: "search", placeholder, icon: <Icon name="search" size={16} /> },
    ]}
  >
    {({ search }) => (
      <AuditTable
        {...props}
        table={
          search
            ? updateIn(table, ["card", "dataset_query", "args"], args =>
                (args || []).concat(search),
              )
            : table
        }
      />
    )}
  </AuditParameters>
);

AuditTableWithSearch.propTypes = propTypes;

export default AuditTableWithSearch;
