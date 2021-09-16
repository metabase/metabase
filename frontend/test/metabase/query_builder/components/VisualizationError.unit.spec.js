import {
  adjustPositions,
  stripRemarks,
} from "metabase/query_builder/components/DataSelector";

describe("VisualizationError", () => {
  const remarkedQuery = "";
  const remarkedRedshiftQuery = "";
  const unremarkedQuery = "";

  const errorPgSql = "";
  const errorLineNumbers = "";

  const errorH2Unstripped = `
  Syntax error in SQL statement " FWEFWEF[*] "; expected "FROM, {"; SQL statement: -- Metabase:: userID: 1 queryType: native queryHash: 9863b8284f269ce8763ad59b04cec26407a1dd74eebeb16cffdf1ef3e23b325a\nfwefwef [42001-197]`
  const errorH2Stripped = `
  Syntax error in SQL statement " FWEFWEF[*] "; expected "FROM, {"; SQL statement: fwefwef [42001-197]`

  it("error adjusted pg", () => {
    expect(stripRemarks(remarkedQuery)).toEqual("some shit");
  });

  it("error adjusted redshift", () => {
    expect(stripRemarks(remarkedQuery)).toEqual("some shit");
  });

  it("error adjusted line numbers", () => {
    expect(stripRemarks(remarkedQuery)).toEqual("some shit");
  });

  it("should just not adjust if there's nothing to adjust (pg)", () => {
  })

  it("should just not adjust if there's nothing to adjust (line numbers)", () => {
  })

  it("should strip remarks from query with stripRemarks", () => {
    expect(stripRemarks(errorH2Unstripped)).toEqual(errorH2Stripped);
  });

  it("stripping stripped errors unchanged", () => {
    expect(stripRemarks(errorH2Stripped)).toEqual(errorH2Stripped);
  });
});
