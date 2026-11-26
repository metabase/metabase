import { t } from "ttag";

import type { DataTestData, DataTestExpectation } from "metabase-types/api";

import { DataTestDataCard } from "../DataTestDataCard";
import { DataTestSection } from "../DataTestSection";

type DataTestOutputSectionProps = {
  label?: string;
  description: string;
  expectations: DataTestExpectation[];
};

export function DataTestOutputSection({
  label = t`Output`,
  description,
  expectations,
}: DataTestOutputSectionProps) {
  return (
    <DataTestSection label={label} description={description}>
      {expectations.map((expectation) => (
        <DataTestDataCard
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
