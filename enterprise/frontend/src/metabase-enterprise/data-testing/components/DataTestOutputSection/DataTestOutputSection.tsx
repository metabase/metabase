import { useEffect } from "react";
import { t } from "ttag";

import { useLocation } from "metabase/router";
import type { DataTestData, DataTestExpectation } from "metabase-types/api";

import { getExpectationAnchor } from "../../utils";
import { DataTestDataCard } from "../DataTestDataCard";
import { DataTestSection } from "../DataTestSection";

type DataTestOutputSectionProps = {
  description: string;
  expectations: DataTestExpectation[];
};

export function DataTestOutputSection({
  description,
  expectations,
}: DataTestOutputSectionProps) {
  const { hash } = useLocation();

  useEffect(() => {
    const card = document.getElementById(hash.slice(1));
    if (hash.length > 1 && card != null) {
      card.scrollIntoView({ block: "center" });
    }
  }, [hash]);

  return (
    <DataTestSection label={t`Output`} description={description}>
      {expectations.map((expectation) => (
        <DataTestDataCard
          key={expectation.name}
          id={getExpectationAnchor(expectation.name)}
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
