import {
  adjustPositions,
  stripRemarks,
} from "metabase/query_builder/components/DataSelector";

describe("VisualizationError", () => {
  const remarkedQuery = "";
  const remarkedRedshiftQuery = "";
  const unremarkedQuery = "";

  const errorPgSql = "";
  const errorMySql = "";
  const errorMsSql = "";
  const errorH2 = "";

  it("error adjusted pg", () => {
    expect(stripRemarks(remarkedQuery)).toEqual("some shit");
  });

  it("error adjusted redshift", () => {
    expect(stripRemarks(remarkedQuery)).toEqual("some shit");
  });

  it("error adjusted mysql", () => {
    expect(stripRemarks(remarkedQuery)).toEqual("some shit");
  });

  it("error adjusted mssql", () => {
    expect(stripRemarks(remarkedQuery)).toEqual("some shit");
  });

  it("error adjusted h2", () => {
    expect(stripRemarks(remarkedQuery)).toEqual("some shit");
  });

  it("unremarked errors unchanged", () => {
    expect(stripRemarks(remarkedQuery)).toEqual("some shit");
  });

  it("should strip remarks from query with stripRemarks", () => {
    expect(stripRemarks(remarkedQuery)).toEqual("some shit");
  });
});
