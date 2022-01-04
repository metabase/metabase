import React from "react";
import PropTypes from "prop-types";

import SearchResult from "metabase/search/components/SearchResult";
import TableInfoPopover from "metabase/components/MetadataInfo/TableInfoPopover";

SearchResultWithInfoPopover.propTypes = {
  item: PropTypes.object.isRequired,
  onSelect: PropTypes.func.isRequired,
};

const OFFSET = [0, 3];

export function SearchResultWithInfoPopover({ item, onSelect }) {
  switch (item.model) {
    case "table":
      return (
        <TableInfoPopover
          placement="right-start"
          offset={OFFSET}
          tableId={item.table_id}
        >
          <li>
            <SearchResult result={item} onClick={onSelect} compact />
          </li>
        </TableInfoPopover>
      );
    default:
      return (
        <li>
          <SearchResult result={item} onClick={onSelect} compact />
        </li>
      );
  }
}
