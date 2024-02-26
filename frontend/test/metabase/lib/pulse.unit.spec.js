import {
  getActivePulseParameters,
  getPulseParameters,
  recipientIsValid,
} from "metabase/lib/pulse";
import MetabaseSettings from "metabase/lib/settings";

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

describe("getActivePulseParameters", () => {
  let pulse;
  let parametersList;
  beforeEach(() => {
    pulse = {
      parameters: [
        {
          id: "no default value",
          value: ["foo"],
        },
        {
          id: "overridden default value",
          default: ["bar"],
          value: ["baz"],
        },
        { id: "does not exist", value: ["does not exist"] },
        { id: "null value that should be overridden", value: null },
      ],
    };

    parametersList = [
      {
        id: "no default value",
      },
      { id: "unused", value: ["unused"] },

      { id: "foo" },
      { id: "overridden default value", default: ["bar"] },
      { id: "unadded default value", default: [123] },
      {
        id: "null value that should be overridden",
        default: ["not null value"],
      },
    ];
  });

  it("should return a list of parameters that are applied to the pulse data", () => {
    expect(getActivePulseParameters(pulse, parametersList)).toEqual([
      {
        id: "no default value",
        value: ["foo"],
      },
      {
        default: ["bar"],
        id: "overridden default value",
        value: ["baz"],
      },
      {
        default: [123],
        id: "unadded default value",
        value: [123],
      },
      {
        default: ["not null value"],
        id: "null value that should be overridden",
        value: ["not null value"],
      },
    ]);
  });
});
