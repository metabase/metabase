import { msgid, ngettext } from "ttag";

import { Label, LabelContainer } from "../MetadataInfo.styled";

export function ColumnCount({ fieldCount }: { fieldCount: number }) {
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
