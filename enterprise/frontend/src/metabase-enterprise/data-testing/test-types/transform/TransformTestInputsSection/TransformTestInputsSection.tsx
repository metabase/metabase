import { msgid, ngettext, t } from "ttag";

import type { DataTestInput } from "metabase-types/api";

import { DataTestSection } from "../../../components/DataTestSection";
import { getTableName } from "../../../utils";
import { TransformTestDataCard } from "../TransformTestDataCard";

type TransformTestInputsSectionProps = {
  inputs: DataTestInput[];
};

export function TransformTestInputsSection({
  inputs,
}: TransformTestInputsSectionProps) {
  return (
    <DataTestSection
      label={t`Inputs`}
      description={t`The transform reads this test data instead of the real tables.`}
    >
      {inputs.map((input) => {
        const name = getTableName(input.table);
        return (
          <TransformTestDataCard
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
