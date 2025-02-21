import { TOKEN, tokenize } from "./tokenizer";

describe("tokenizer", () => {
  it("tokenizes valid expression", () => {
    const { tokens } = tokenize('case([Total] > 200, [T], "Nothing")');

    expect(tokens).toEqual([
      { type: TOKEN.Identifier, start: 0, end: 4 }, // case
      { type: TOKEN.Operator, op: "(", start: 4, end: 5 }, // (
      { type: TOKEN.Identifier, start: 5, end: 12 }, // [Total]
      { type: TOKEN.Operator, op: ">", start: 13, end: 14 }, // >
      { type: TOKEN.Number, start: 15, end: 18 }, // 200
      { type: TOKEN.Operator, op: ",", start: 18, end: 19 }, // ,
      { type: TOKEN.Identifier, start: 20, end: 23 }, // [T]
      { type: TOKEN.Operator, op: ",", start: 23, end: 24 }, // ,
      { type: TOKEN.String, start: 25, end: 34, value: "Nothing" }, // "Nothing"
      { type: TOKEN.Operator, op: ")", start: 34, end: 35 }, // )
    ]);
  });

  it("takes operators into account when dealing with incomplete bracket identifier tokens", () => {
    const { tokens } = tokenize('case([Total] > 200, [To, "Nothing")');

    expect(tokens).toEqual([
      { type: TOKEN.Identifier, start: 0, end: 4 }, // case
      { type: TOKEN.Operator, op: "(", start: 4, end: 5 }, // (
      { type: TOKEN.Identifier, start: 5, end: 12 }, // [Total]
      { type: TOKEN.Operator, op: ">", start: 13, end: 14 }, // >
      { type: TOKEN.Number, start: 15, end: 18 }, // 200
      { type: TOKEN.Operator, op: ",", start: 18, end: 19 }, // ,
      { type: TOKEN.Identifier, start: 20, end: 23 }, // [To <-- that's the incomplete token
      { type: TOKEN.Operator, op: ",", start: 23, end: 24 }, // ,
      { type: TOKEN.String, start: 25, end: 34, value: "Nothing" }, // "Nothing"
      { type: TOKEN.Operator, op: ")", start: 34, end: 35 }, // )
    ]);
  });

  it("tokenizes incomplete bracket identifier followed by whitespace (metabase#50925)", () => {
    const { tokens } = tokenize("[Pr [Price]");

    expect(tokens).toEqual([
      { type: TOKEN.Identifier, start: 0, end: 3 }, // [Pr
      { type: TOKEN.Identifier, start: 4, end: 11 }, // [Price]
    ]);
  });

  it("tokenizes incomplete bracket identifier followed by bracket identifier (metabase#50925)", () => {
    const { tokens } = tokenize("[Pr[Price]");

    expect(tokens).toEqual([
      { type: TOKEN.Identifier, start: 0, end: 3 }, // [Pr
      { type: TOKEN.Identifier, start: 3, end: 10 }, // [Price]
    ]);
  });
});
