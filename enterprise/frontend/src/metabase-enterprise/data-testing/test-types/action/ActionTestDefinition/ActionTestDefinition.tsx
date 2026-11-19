import { t } from "ttag";

import type { ActionTest } from "metabase-types/api";

import { DataTestInputsSection } from "../../../components/DataTestInputsSection";
import { DataTestOutputSection } from "../../../components/DataTestOutputSection";
import { ActionTestParametersSection } from "../ActionTestParametersSection";

type ActionTestDefinitionProps = {
  test: ActionTest;
};

export function ActionTestDefinition({ test }: ActionTestDefinitionProps) {
  return (
    <>
      <ActionTestParametersSection parameters={test.parameters ?? {}} />
      <DataTestInputsSection
        description={t`The action runs on this test data instead of the real tables.`}
        inputs={test.inputs}
      />
      <DataTestOutputSection
        label={t`Checks`}
        description={t`Checks on the tables after the action runs.`}
        expectations={test.expectations}
      />
    </>
  );
}
