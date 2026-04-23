import {
  type RecipientPickerValue,
  getActivePulseParameters,
  getPulseParameters,
  recipientIsValid,
} from "metabase/pulse";
import type { DashboardSubscriptionData } from "metabase/redux/store";
import MetabaseSettings from "metabase/utils/settings";
import type { Parameter } from "metabase-types/api";

describe("recipientIsValid", () => {
  let originalDomains: string | null | undefined;

  beforeEach(() => {
    originalDomains = MetabaseSettings.get("subscription-allowed-domains");
  });

  afterEach(() => {
    MetabaseSettings.set(
      "subscription-allowed-domains",
      originalDomains ?? null,
    );
  });

  it("should be valid for every metabase user", () => {
    const recipient = {
      id: 1,
      email: "user@metabase.example",
    };
    MetabaseSettings.set("subscription-allowed-domains", "metabase.test");
    expect(recipientIsValid(recipient)).toBeTruthy();
  });

  it("should be valid when approved domains are not set", () => {
    const recipient: RecipientPickerValue = {
      email: "user@metabase.example",
    };
    expect(recipientIsValid(recipient)).toBeTruthy();
  });

  it("should not be valid for a recipient with another domain", () => {
    const recipient: RecipientPickerValue = {
      email: "user@metabase.example",
    };
    MetabaseSettings.set("subscription-allowed-domains", "metabase.test");
    expect(recipientIsValid(recipient)).toBeFalsy();
  });

  it("should be valid for a recipient with the specified domain", () => {
    const recipient: RecipientPickerValue = { email: "user@metabase.test" };
    MetabaseSettings.set("subscription-allowed-domains", "metabase.test");
    expect(recipientIsValid(recipient)).toBeTruthy();
  });
});

describe("getPulseParameters", () => {
  it("returns a pulse's parameters", () => {
    const pulse: DashboardSubscriptionData = {
      cards: [],
      channels: [],
      parameters: [
        { id: "foo", name: "foo", type: "string", slug: "foo", value: ["foo"] },
      ],
    };
    expect(getPulseParameters(pulse)).toEqual([
      { id: "foo", name: "foo", type: "string", slug: "foo", value: ["foo"] },
    ]);
  });

  it("defaults to an empty array", () => {
    const pulse: DashboardSubscriptionData = { cards: [], channels: [] };
    expect(getPulseParameters(pulse)).toEqual([]);
  });
});

describe("getActivePulseParameters", () => {
  let pulse: DashboardSubscriptionData;
  let parametersList: Parameter[];

  const param = (
    overrides: Partial<Parameter> & { id: string },
  ): Parameter => ({
    name: overrides.id,
    type: "string",
    slug: overrides.id,
    ...overrides,
  });

  beforeEach(() => {
    pulse = {
      cards: [],
      channels: [],
      parameters: [
        param({ id: "no default value", value: ["foo"] }),
        param({ id: "overridden default value", value: ["baz"] }),
        param({ id: "does not exist", value: ["does not exist"] }),
        param({ id: "null value that should be filtered out", value: null }),
        param({
          id: "undefined value that should be overridden by default",
          value: undefined,
        }),
      ],
    };

    parametersList = [
      param({ id: "no default value" }),
      param({ id: "unused", value: ["unused"] }),
      param({ id: "foo" }),
      param({ id: "overridden default value", default: ["bar"] }),
      param({ id: "unadded default value", default: [123] }),
      param({
        id: "null value that should be filtered out",
        default: ["not null value"],
      }),
      param({
        id: "undefined value that should be overridden by default",
        default: ["not null value"],
      }),
    ];
  });

  it("should return a list of parameters that are applied to the pulse data", () => {
    expect(getActivePulseParameters(pulse, parametersList)).toEqual([
      expect.objectContaining({
        id: "no default value",
        value: ["foo"],
      }),
      expect.objectContaining({
        default: ["bar"],
        id: "overridden default value",
        value: ["baz"],
      }),
      expect.objectContaining({
        default: [123],
        id: "unadded default value",
        value: [123],
      }),
      expect.objectContaining({
        default: ["not null value"],
        id: "undefined value that should be overridden by default",
        value: ["not null value"],
      }),
    ]);
  });
});
