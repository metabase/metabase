import React from "react";
import PropTypes from "prop-types";
import { msgid, ngettext } from "ttag";

import Table from "metabase-lib/lib/metadata/Table";

import { Label, LabelContainer } from "../MetadataInfo.styled";

ColumnCount.propTypes = {
  table: PropTypes.instanceOf(Table).isRequired,
};

function ColumnCount({ table }: { table: Table }) {
  const fieldCount = table.numFields();
  return (
    <LabelContainer color="text-dark">
      <Label>
        {ngettext(
          msgid`${fieldCount} column`,
          `${fieldCount} columns`,
          fieldCount,
        )}
      </Label>
    </LabelContainer>
  );
}

export default ColumnCount;
