import { t } from "ttag";

import type {
  DataTestData,
  DataTestExpectation,
  Transform,
} from "metabase-types/api";

import { DataTestSection } from "../../../components/DataTestSection";
import { getTableName } from "../../../utils";
import { TransformTestDataCard } from "../TransformTestDataCard";

type TransformTestOutputSectionProps = {
  transform: Transform;
  expectations: DataTestExpectation[];
};

export function TransformTestOutputSection({
  transform,
  expectations,
}: TransformTestOutputSectionProps) {
  const tableName = getTableName(transform.target);

  return (
    <DataTestSection
      label={t`Output`}
      description={t`Checks on ${tableName}, the table this transform writes.`}
    >
      {expectations.map((expectation) => (
        <TransformTestDataCard
          key={expectation.name}
          name={expectation.name}
          icon="list"
          description={getExpectationDescription(expectation)}
          data={getExpectationData(expectation)}
        />
      ))}
    </DataTestSection>
  );
}

function getExpectationDescription(expectation: DataTestExpectation) {
  switch (expectation.type) {
    case "equals":
      return t`Must hold exactly these rows`;
    case "empty":
      return t`This query must return no rows`;
  }
}

function getExpectationData(expectation: DataTestExpectation): DataTestData {
  if (expectation.type === "empty") {
    return { format: "sql", sql: expectation.sql };
  }
  return expectation;
}
