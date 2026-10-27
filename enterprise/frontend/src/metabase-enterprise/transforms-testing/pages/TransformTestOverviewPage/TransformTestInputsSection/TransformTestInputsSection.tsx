import { msgid, ngettext, t } from "ttag";

import type { TransformTestInput } from "metabase-types/api";

import { TransformTestDataCard } from "../../../components/TransformTestDataCard";
import { TransformTestSection } from "../../../components/TransformTestSection";
import { getTableName } from "../../../utils";

type TransformTestInputsSectionProps = {
  inputs: TransformTestInput[];
};

export function TransformTestInputsSection({
  inputs,
}: TransformTestInputsSectionProps) {
  return (
    <TransformTestSection
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
    </TransformTestSection>
  );
}

function getInputDescription(input: TransformTestInput) {
  if (input.format === "sql") {
    return t`Rows returned by a query`;
  }
  const count = input.rows.length;
  return ngettext(msgid`${count} row`, `${count} rows`, count);
}
