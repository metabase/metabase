import { getQuestionGoalSourcesScope } from "./goal-source-results";

describe("getQuestionGoalSourcesScope", () => {
  it("reads the goals of a static or guest embed from its embed route", () => {
    expect(getQuestionGoalSourcesScope({ token: "embed-token" })).toEqual({
      type: "embed-card",
      token: "embed-token",
    });
  });

  it("reads the goals of a public link from its public route", () => {
    expect(getQuestionGoalSourcesScope({ uuid: "public-uuid" })).toEqual({
      type: "public-card",
      uuid: "public-uuid",
    });
  });

  it("reads the goals of a signed-in user's question from the signed-in route", () => {
    expect(getQuestionGoalSourcesScope({ token: null, uuid: null })).toEqual({
      type: "signed-in",
    });
  });
});
