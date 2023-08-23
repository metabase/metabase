import MetabaseSettings from "metabase/lib/settings";
import { getPulseParameters, recipientIsValid } from "metabase/lib/pulse";

describe("recipientIsValid", () => {
  let originalDomains;

  beforeEach(() => {
    originalDomains = MetabaseSettings.get("subscription-allowed-domains");
  });

  afterEach(() => {
    MetabaseSettings.set("subscription-allowed-domains", originalDomains);
  });

  it("should be valid for every metabase user", () => {
    const recipient = { id: 1, email: "user@metabase.example" };
    MetabaseSettings.set("subscription-allowed-domains", "metabase.test");
    expect(recipientIsValid(recipient)).toBeTruthy();
  });

  it("should be valid when approved domains are not set", () => {
    const recipient = { email: "user@metabase.example" };
    expect(recipientIsValid(recipient)).toBeTruthy();
  });

  it("should not be valid for a recipient with another domain", () => {
    const recipient = { email: "user@metabase.example" };
    MetabaseSettings.set("subscription-allowed-domains", "metabase.test");
    expect(recipientIsValid(recipient)).toBeFalsy();
  });

  it("should be valid for a recipient with the specified domain", () => {
    const recipient = { email: "user@metabase.test" };
    MetabaseSettings.set("subscription-allowed-domains", "metabase.test");
    expect(recipientIsValid(recipient)).toBeTruthy();
  });
});

describe("getPulseParameters", () => {
  it("returns a pulse's parameters", () => {
    expect(
      getPulseParameters({
        parameters: [{ id: "foo", value: ["foo"] }],
      }),
    ).toEqual([{ id: "foo", value: ["foo"] }]);
  });

  it("defaults to an empty array", () => {
    expect(getPulseParameters()).toEqual([]);
    expect(getPulseParameters({})).toEqual([]);
  });
});
