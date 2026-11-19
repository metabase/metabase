import { t } from "ttag";

import { useGetTransformQuery } from "metabase/api";
import type { Transform, TransformTest } from "metabase-types/api";

import { DataTestInputsSection } from "../../../components/DataTestInputsSection";
import { DataTestOutputSection } from "../../../components/DataTestOutputSection";
import { getTableName } from "../../../utils";

type TransformTestDefinitionProps = {
  test: TransformTest;
};

export function TransformTestDefinition({
  test,
}: TransformTestDefinitionProps) {
  const { data: transform } = useGetTransformQuery(test.transform_id);

  return (
    <>
      <DataTestInputsSection
        description={t`The transform reads this test data instead of the real tables.`}
        inputs={test.inputs}
      />
      {transform != null && (
        <DataTestOutputSection
          description={getOutputDescription(transform)}
          expectations={test.expectations}
        />
      )}
    </>
  );
}

function getOutputDescription(transform: Transform) {
  const tableName = getTableName(transform.target);
  return t`Checks on ${tableName}, the table this transform writes.`;
}
