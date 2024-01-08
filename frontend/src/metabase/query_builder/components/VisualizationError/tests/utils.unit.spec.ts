import { adjustPositions, stripRemarks } from "../utils";

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
