import { updateIn } from "icepick";
import PropTypes from "prop-types";
import { t } from "ttag";

import { Icon } from "metabase/ui";

import AuditParameters from "../components/AuditParameters";

import AuditTable from "./AuditTable";

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
