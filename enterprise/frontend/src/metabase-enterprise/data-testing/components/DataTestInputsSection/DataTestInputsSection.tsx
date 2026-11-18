import { msgid, ngettext, t } from "ttag";

import type { DataTestInput } from "metabase-types/api";

import { getTableName } from "../../utils";
import { DataTestDataCard } from "../DataTestDataCard";
import { DataTestSection } from "../DataTestSection";

type DataTestInputsSectionProps = {
  description: string;
  inputs: DataTestInput[];
};

export function DataTestInputsSection({
  description,
  inputs,
}: DataTestInputsSectionProps) {
  return (
    <DataTestSection label={t`Inputs`} description={description}>
      {inputs.map((input) => {
        const name = getTableName(input.table);
        return (
          <DataTestDataCard
            key={name}
            name={name}
            icon="table2"
            description={getInputDescription(input)}
            data={input}
          />
        );
      })}
    </DataTestSection>
  );
}

function getInputDescription(input: DataTestInput) {
  if (input.format === "sql") {
    return t`Rows returned by a query`;
  }
  const count = input.rows.length;
  return ngettext(msgid`${count} row`, `${count} rows`, count);
}
