import { t } from "ttag";

import type { CardTest } from "metabase-types/api";

import { DataTestInputsSection } from "../../../components/DataTestInputsSection";
import { DataTestOutputSection } from "../../../components/DataTestOutputSection";

type CardTestDefinitionProps = {
  test: CardTest;
};

export function CardTestDefinition({ test }: CardTestDefinitionProps) {
  return (
    <>
      <DataTestInputsSection
        description={t`The query reads this test data instead of the real tables.`}
        inputs={test.inputs}
      />
      <DataTestOutputSection
        description={t`Checks on the rows the query returns.`}
        expectations={test.expectations}
      />
    </>
  );
}
