import { msgid, ngettext } from "ttag";

import { Label, LabelContainer } from "../MetadataInfo";

export function ColumnCount({ fieldCount }: { fieldCount: number }) {
  return (
    <LabelContainer c="text-primary">
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
