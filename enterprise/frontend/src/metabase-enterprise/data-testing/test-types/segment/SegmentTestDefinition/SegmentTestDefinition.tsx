import { t } from "ttag";

import type { SegmentTest } from "metabase-types/api";

import { DataTestInputsSection } from "../../../components/DataTestInputsSection";
import { DataTestOutputSection } from "../../../components/DataTestOutputSection";

type SegmentTestDefinitionProps = {
  test: SegmentTest;
};

export function SegmentTestDefinition({ test }: SegmentTestDefinitionProps) {
  return (
    <>
      <DataTestInputsSection
        description={t`The segment reads this test data instead of the real tables.`}
        inputs={test.inputs}
      />
      <DataTestOutputSection
        description={t`Checks on the rows the segment matches.`}
        expectations={test.expectations}
      />
    </>
  );
}
