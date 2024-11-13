import { TOKEN, tokenize } from "./tokenizer";

describe("tokenizer", () => {
  it("takes commas into account when dealing with incomplete tokens", () => {
    const { tokens } = tokenize('case([Total] > 200, [to, "Nothing")');

    expect(tokens).toEqual([
      { type: TOKEN.Identifier, start: 0, end: 4 }, // case
      { type: TOKEN.Operator, op: "(", start: 4, end: 5 }, // (
      { type: TOKEN.Identifier, start: 5, end: 12 }, // [Total]
      { type: TOKEN.Operator, op: ">", start: 13, end: 14 }, // >
      { type: TOKEN.Number, start: 15, end: 18 }, // 200
      { type: TOKEN.Operator, op: ",", start: 18, end: 19 }, // ,
      { type: TOKEN.Identifier, start: 20, end: 23 }, // [to
      { type: TOKEN.Operator, op: ",", start: 23, end: 34 }, // ,
      { type: TOKEN.Identifier, start: 25, end: 34 }, // "Nothing"
      { type: TOKEN.Operator, op: ")", start: 34, end: 35 }, // )
    ]);
  });
});
