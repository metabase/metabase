import { stripRemarks } from "../utils";

describe("stripRemarks", () => {
  const errorH2Unstripped = `
  Syntax error in SQL statement " FWEFWEF[*] "; expected "FROM, {"; SQL statement: -- Metabase:: userID: 1 queryType: native queryHash: 9863b8284f269ce8763ad59b04cec26407a1dd74eebeb16cffdf1ef3e23b325a\nfwefwef [42001-197]`;
  const errorH2Stripped = `
  Syntax error in SQL statement " FWEFWEF[*] "; expected "FROM, {"; SQL statement: fwefwef [42001-197]`;
  const errorH2WithExtraFields = `
  Syntax error in SQL statement " FWEFWEF[*] "; expected "FROM, {"; SQL statement: -- Metabase:: userID: 1 queryType: native queryHash: 9863b8284f269ce8763ad59b04cec26407a1dd74eebeb16cffdf1ef3e23b325a accountID: 1b4e9a2f-1c3d-4e5f-8a9b-0c1d2e3f4a5b cardID: 10 context: question databaseID: 1\nfwefwef [42001-197]`;

  it("should strip remarks from query with stripRemarks", () => {
    expect(stripRemarks(errorH2Unstripped)).toEqual(errorH2Stripped);
  });

  it("stripping stripped errors unchanged", () => {
    expect(stripRemarks(errorH2Stripped)).toEqual(errorH2Stripped);
  });

  it("should strip remarks with extra fields", () => {
    expect(stripRemarks(errorH2WithExtraFields)).toEqual(errorH2Stripped);
  });
});
