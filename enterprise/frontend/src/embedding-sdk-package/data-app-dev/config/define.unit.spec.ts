import { getDataAppDefine } from "./define";

describe("getDataAppDefine", () => {
  it("defines process.env.NODE_ENV for production builds", () => {
    expect(getDataAppDefine("production")).toEqual({
      "process.env.NODE_ENV": '"production"',
    });
  });

  it("defines process.env.NODE_ENV for development builds", () => {
    expect(getDataAppDefine("development")).toEqual({
      "process.env.NODE_ENV": '"development"',
    });
  });
});
