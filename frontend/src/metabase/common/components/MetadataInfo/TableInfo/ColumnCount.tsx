import { msgid, ngettext } from "ttag";

import type Table from "metabase-lib/v1/metadata/Table";

import { Label, LabelContainer } from "../MetadataInfo.styled";

function ColumnCount({ table }: { table: Table }) {
  const fieldCount = table.numFields();
  return (
    <LabelContainer color="text-primary">
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ColumnCount;
