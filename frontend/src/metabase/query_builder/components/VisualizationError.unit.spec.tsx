import { getMetadata } from "metabase/selectors/metadata";
import type { Card, Database } from "metabase-types/api";
import { createMockCard, createMockDatabase } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";
import { createMockEntitiesState } from "__support__/store";
import { render, screen } from "__support__/ui";
import VisualizationError, {
  adjustPositions,
  stripRemarks,
} from "./VisualizationError";

interface SetupOpts {
  database?: Database;
  card?: Card;
}

const setup = ({
  database = createMockDatabase(),
  card = createMockCard(),
}: SetupOpts) => {
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [database],
      questions: [card],
    }),
  });

  const metadata = getMetadata(state);
  const question = metadata.question(card.id);

  render(
    <VisualizationError
      question={question}
      duration={0}
      error="An error occurred"
      via={{}}
    />,
  );
};

describe("VisualizationError", () => {
  it("should show a help link for sql databases", () => {
    const database = createMockDatabase({
      engine: "postgres",
    });
    const card = createMockCard({
      dataset_query: {
        database: database.id,
        type: "native",
        native: {
          query: "SELECT * FROM ORDERS",
        },
      },
    });
    setup({ database, card });

    expect(
      screen.getByText("Learn how to debug SQL errors"),
    ).toBeInTheDocument();
  });

  it("should not show a help link for a nosql databases", () => {
    const database = createMockDatabase({
      engine: "mongo",
    });
    const card = createMockCard({
      dataset_query: {
        database: database.id,
        type: "native",
        native: {
          query: "[]",
        },
      },
    });
    setup({ database, card });

    expect(
      screen.queryByText("Learn how to debug SQL errors"),
    ).not.toBeInTheDocument();
  });
});

describe("adjustPositions", () => {
  const remarkedQuery =
    "-- Metabase:: userID: 1 queryType: native queryHash: 9863b8284f269ce8763ad59b04cec26407a1dd74eebeb16cffdf1ef3e23b325a\nfwefwef";
  const remarkedRedshiftQuery =
    "/* anything before the remarks in multiline is redshift */-- Metabase:: userID: 1 queryType: native queryHash: 9863b8284f269ce8763ad59b04cec26407a1dd74eebeb16cffdf1ef3e23b325a\nfwefwef";
  const unremarkedQuery = "fwefwef";

  const unadjustedError = `boopy boop boopy boop fake error message Position: 1000;`;
  const adjustedError = `boopy boop boopy boop fake error message Position: 881;`;
  const redshiftAdjustedError = `boopy boop boopy boop fake error message Position: 823;`;

  const errorLineNumbers = "boopy boop boopy boop fake error message Line: 2";

  it("error adjusted pg", () => {
    expect(adjustPositions(unadjustedError, remarkedQuery)).toEqual(
      adjustedError,
    );
  });

  it("error adjusted redshift", () => {
    expect(adjustPositions(unadjustedError, remarkedRedshiftQuery)).toEqual(
      redshiftAdjustedError,
    );
  });

  it("unremarked query should be a noop", () => {
    expect(adjustPositions(unadjustedError, unremarkedQuery)).toEqual(
      unadjustedError,
    );
  });

  it("error adjusted line numbers should be a noop", () => {
    expect(adjustPositions(errorLineNumbers, remarkedQuery)).toEqual(
      errorLineNumbers,
    );
  });
});
describe("stripRemarks", () => {
  const errorH2Unstripped = `
  Syntax error in SQL statement " FWEFWEF[*] "; expected "FROM, {"; SQL statement: -- Metabase:: userID: 1 queryType: native queryHash: 9863b8284f269ce8763ad59b04cec26407a1dd74eebeb16cffdf1ef3e23b325a\nfwefwef [42001-197]`;
  const errorH2Stripped = `
  Syntax error in SQL statement " FWEFWEF[*] "; expected "FROM, {"; SQL statement: fwefwef [42001-197]`;

  it("should strip remarks from query with stripRemarks", () => {
    expect(stripRemarks(errorH2Unstripped)).toEqual(errorH2Stripped);
  });

  it("stripping stripped errors unchanged", () => {
    expect(stripRemarks(errorH2Stripped)).toEqual(errorH2Stripped);
  });
});
