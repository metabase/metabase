import { CALL, Token } from "../pratt";

import { position } from "./utils";

describe("position", () => {
  it("returns the correct position", () => {
    const token = new Token({
      type: CALL,
      pos: 4,
      length: 12,
      text: "foo",
    });
    const node = {
      type: CALL,
      children: [],
      parent: null,
      token,
      complete: true,
    };
    const parts = {
      operator: "concat",
      options: {},
      args: [],
      node,
    };

    const pos = { pos: 4, len: 12 };

    expect(position(undefined)).toEqual(undefined);
    expect(position(null)).toEqual(undefined);
    expect(position({ node: undefined })).toEqual(undefined);
    expect(position({ node })).toEqual(pos);
    expect(position({ token })).toEqual(pos);
    expect(position({ token: undefined })).toEqual(undefined);
    expect(position(parts)).toEqual(pos);
    expect(position(pos)).toEqual(pos);
  });
});
