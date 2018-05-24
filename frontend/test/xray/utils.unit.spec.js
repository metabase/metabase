import { distanceToPhrase } from "metabase/xray/utils";

describe("distanceToPhrase", () => {
  it("should return the proper phrases", () => {
    expect(distanceToPhrase(0.88)).toEqual("Very different");
    expect(distanceToPhrase(0.5)).toEqual("Somewhat different");
    expect(distanceToPhrase(0.36)).toEqual("Somewhat similar");
    expect(distanceToPhrase(0.16)).toEqual("Very similar");
  });
});
