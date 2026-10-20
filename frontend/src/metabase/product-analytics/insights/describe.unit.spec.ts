import {
  describeAttribute,
  describeCondition,
  describeExcess,
  describeLift,
  describeValue,
} from "./describe";

describe("describeLift", () => {
  it.each([
    { rate: 0.3, restRate: 0.2, expected: "50% more likely to convert" },
    { rate: 0.12, restRate: 0.2, expected: "40% less likely to convert" },
    { rate: 0.5, restRate: 0.2, expected: "2.5× as likely to convert" },
    { rate: 0.4, restRate: 0.2, expected: "2× as likely to convert" },
    { rate: 0.0105, restRate: 0.01, expected: "5% more likely to convert" },
    { rate: 0.0099, restRate: 0.01, expected: "1% less likely to convert" },
    { rate: 0.1003, restRate: 0.1, expected: "0.3% more likely to convert" },
  ])(
    "describes $rate vs. $restRate as “$expected”",
    ({ rate, restRate, expected }) => {
      expect(describeLift({ rate, restRate })).toBe(expected);
    },
  );
});

describe("describeExcess", () => {
  it("rounds to whole conversions in either direction", () => {
    expect(describeExcess({ excess: 341.6 })).toBe(
      "About 342 more conversions than at everyone else's rate",
    );
    expect(describeExcess({ excess: -1200.2 })).toBe(
      "About 1,200 fewer conversions than at everyone else's rate",
    );
  });

  it("uses the singular for one conversion", () => {
    expect(describeExcess({ excess: -1.2 })).toBe(
      "About 1 fewer conversion than at everyone else's rate",
    );
  });
});

describe("describeCondition", () => {
  const browser = { column: "browser", displayName: "Browser" };
  const identified = {
    column: "person__identified",
    displayName: "Person Identified",
  };

  it("names the column and its value", () => {
    expect(describeCondition(browser, "Safari")).toBe("Browser is Safari");
    expect(describeCondition(browser, "(not set)")).toBe("Browser is not set");
  });

  it("describes whether the person was identified as a state", () => {
    expect(describeCondition(identified, "false")).toBe("Person is anonymous");
    expect(describeCondition(identified, "true")).toBe("Person is identified");
  });
});

describe("describeValue", () => {
  it("keeps the values of most columns as they are", () => {
    expect(
      describeValue({ column: "browser", displayName: "Browser" }, "Safari"),
    ).toBe("Safari");
  });

  it("names whether the person was identified", () => {
    const identified = {
      column: "person__identified",
      displayName: "Person Identified",
    };
    expect(describeValue(identified, "false")).toBe("Anonymous");
    expect(describeValue(identified, "true")).toBe("Identified");
  });
});

describe("describeAttribute", () => {
  it("uses the column's description", () => {
    expect(
      describeAttribute({
        column: "role",
        displayName: "Role",
        description: "Set at signup",
      }),
    ).toBe("Set at signup");
  });

  it("explains whether the person was identified without a description", () => {
    expect(
      describeAttribute({
        column: "person__identified",
        displayName: "Person Identified",
      }),
    ).toMatch(/^Identified people have been linked to an account/);
  });

  it("has nothing to add for other columns", () => {
    expect(
      describeAttribute({ column: "browser", displayName: "Browser" }),
    ).toBeUndefined();
  });
});
