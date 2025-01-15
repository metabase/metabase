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
    const { tokens } = tokenize("case([ID] = 1, [Price] * 1.21, [Pr [Price])");

    expect(tokens).toEqual([
      { type: 4, start: 0, end: 4 }, // case
      { type: 1, op: "(", start: 4, end: 5 }, // (
      { type: 4, start: 5, end: 9 }, // [ID]
      { type: 1, op: "=", start: 10, end: 11 }, // =
      { type: 2, start: 12, end: 13 }, // 1
      { type: 1, op: ",", start: 13, end: 14 }, // ,
      { type: 4, start: 15, end: 22 }, // [Price]
      { type: 1, op: "*", start: 23, end: 24 }, // *
      { type: 2, start: 25, end: 29 }, // 1.21
      { type: 1, op: ",", start: 29, end: 30 }, // ,
      { type: 4, start: 31, end: 34 }, // [Pr
      { type: 4, start: 35, end: 42 }, // [Price]
      { type: 1, op: ")", start: 42, end: 43 }, // )
    ]);
  });

  it("tokenizes incomplete bracket identifier followed by bracket identifier (metabase#50925)", () => {
    const { tokens } = tokenize("case([ID] = 1, [Price] * 1.21, [Pr[Price])");

    expect(tokens).toEqual([
      { type: 4, start: 0, end: 4 }, // case
      { type: 1, op: "(", start: 4, end: 5 }, // (
      { type: 4, start: 5, end: 9 }, // [ID]
      { type: 1, op: "=", start: 10, end: 11 }, // =
      { type: 2, start: 12, end: 13 }, // 1
      { type: 1, op: ",", start: 13, end: 14 }, // ,
      { type: 4, start: 15, end: 22 }, // [Price]
      { type: 1, op: "*", start: 23, end: 24 }, // *
      { type: 2, start: 25, end: 29 }, // 1.21
      { type: 1, op: ",", start: 29, end: 30 }, // ,
      { type: 4, start: 31, end: 34 }, // [Pr
      { type: 4, start: 34, end: 41 }, // [Price]
      { type: 1, op: ")", start: 41, end: 42 }, // )
    ]);
  });
});
