import { useGetTransformQuery } from "metabase/api";
import type { TransformTest } from "metabase-types/api";

import { TransformTestInputsSection } from "../TransformTestInputsSection";
import { TransformTestOutputSection } from "../TransformTestOutputSection";

type TransformTestDefinitionProps = {
  test: TransformTest;
};

export function TransformTestDefinition({
  test,
}: TransformTestDefinitionProps) {
  const { data: transform } = useGetTransformQuery(test.transform_id);

  return (
    <>
      <TransformTestInputsSection inputs={test.inputs} />
      {transform != null && (
        <TransformTestOutputSection
          transform={transform}
          expectations={test.expectations}
        />
      )}
    </>
  );
}
