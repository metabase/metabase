import React from "react";
import { render, cleanup, screen } from "@testing-library/react";
import SessionTimeoutSetting from "metabase-enterprise/auth/components/SessionTimeoutSetting";

describe("SessionTimeoutSetting", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  const TEST_CASES = [
    { value: { amount: 1, unit: "minutes" }, expected: null },
    {
      value: { amount: 1, unit: "hours" },
      expected: null,
    },
    {
      value: { amount: 0, unit: "minutes" },
      expected: "Timeout must be greater than 0",
    },
    {
      value: { amount: 0, unit: "hours" },
      expected: "Timeout must be greater than 0",
    },
    {
      value: { amount: 60 * 24 * 365.25 * 100, unit: "minutes" },
      expected: "Timeout must be less than 100 years",
    },
    {
      value: { amount: 60 * 24 * 365.25 * 100 - 1, unit: "minutes" },
      expected: null,
    },
    {
      value: { amount: 24 * 365.25 * 100, unit: "hours" },
      expected: "Timeout must be less than 100 years",
    },
    {
      value: { amount: 24 * 365.25 * 100 - 1, unit: "hours" },
      expected: null,
    },
  ];
  TEST_CASES.map(({ value, expected }) => {
    it(`validates ${value.amount} ${value.unit} correctly`, () => {
      const setting = { value: value, key: "...", default: "..." };
      render(<SessionTimeoutSetting setting={setting} onChange={jest.fn()} />);
      const input = screen.getByTestId("session-timeout-input");
      if (expected == null) {
        expect(screen.queryByText(/Timeout must be/)).not.toBeInTheDocument();
      } else {
        expect(screen.queryByText(expected)).toBeInTheDocument();
      }
    });
  });
});
