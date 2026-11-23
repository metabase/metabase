import { renderWithProviders, screen } from "__support__/ui";

import { DATA_CHECK_CATALOGUE, getDataCheckCatalogueEntry } from "./catalogue";
import { DataCheckForm, DataCheckResultCard } from "./components";
import { describeDataCheck } from "./describe";
import { DQ_FIXTURE, DQ_TABLES } from "./fixtures";
import type { DataCheckDefinition, DataCheckRun } from "./types";

const RUNNABLE_ENTRIES = DATA_CHECK_CATALOGUE.filter(
  (entry) => !entry.unsupported,
);

const EXAMPLE_RUNS: [string, DataCheckRun][] = DQ_FIXTURE.examples.flatMap(
  ({ definition, passing, failing }): [string, DataCheckRun][] => [
    [`${definition.check} passing`, { definition, result: passing }],
    [`${definition.check} failing`, { definition, result: failing }],
  ],
);

const UNSUPPORTED_RUNS = DQ_FIXTURE.extras.filter(
  ({ result }) => result.reason === "unsupported",
);

function getFallbackSentence({ check, table }: DataCheckDefinition) {
  return `${check} on ${table}`;
}

describe("data check catalogue coverage", () => {
  it("has a real result for every check type that runs", () => {
    const checksWithExamples = DQ_FIXTURE.examples.map(
      ({ definition }) => definition.check,
    );
    expect(checksWithExamples.toSorted()).toEqual(
      RUNNABLE_ENTRIES.map((entry) => entry.name).toSorted(),
    );
  });

  it("has a real result for every check type that cannot run yet", () => {
    const unsupportedChecks = UNSUPPORTED_RUNS.map(
      ({ result }) => result.check,
    );
    expect(unsupportedChecks.toSorted()).toEqual(
      DATA_CHECK_CATALOGUE.filter((entry) => entry.unsupported)
        .map((entry) => entry.name)
        .toSorted(),
    );
  });

  it.each(EXAMPLE_RUNS)(
    "shows %s with its own view and sentence",
    (_name, run) => {
      renderWithProviders(<DataCheckResultCard {...run} />);

      expect(
        screen.queryByTestId("data-check-generic-view"),
      ).not.toBeInTheDocument();
      expect(describeDataCheck(run.definition)).not.toBe(
        getFallbackSentence(run.definition),
      );
      expect(
        screen.getByText(run.result.status === "pass" ? "Passed" : "Failed"),
      ).toBeInTheDocument();
    },
  );

  it.each(
    UNSUPPORTED_RUNS.map((run): [string, DataCheckRun] => [
      run.result.check,
      run,
    ]),
  )("explains why %s cannot run yet", (_name, run) => {
    renderWithProviders(<DataCheckResultCard {...run} />);

    expect(screen.getByText("Can't run yet")).toBeInTheDocument();
    expect(screen.getByText("This check can't run yet")).toBeInTheDocument();
    expect(describeDataCheck(run.definition)).not.toBe(
      getFallbackSentence(run.definition),
    );
  });

  it.each(DATA_CHECK_CATALOGUE.map((entry) => entry.name))(
    "has a form field for every parameter of %s",
    (check) => {
      const entry = getDataCheckCatalogueEntry(check);
      renderWithProviders(
        <DataCheckForm
          initialDefinition={{ check, table: "orders", params: {} }}
          tables={DQ_TABLES}
        />,
      );

      for (const param of entry?.params ?? []) {
        expect(screen.getAllByText(param.name).length).toBeGreaterThan(0);
      }
    },
  );

  it("shows an unknown check type with the generic view", () => {
    const [example] = DQ_FIXTURE.examples;
    renderWithProviders(
      <DataCheckResultCard
        definition={{ ...example.definition, check: "from_the_future" }}
        result={{ ...example.failing, check: "from_the_future" }}
      />,
    );

    expect(screen.getByTestId("data-check-generic-view")).toBeInTheDocument();
  });
});
