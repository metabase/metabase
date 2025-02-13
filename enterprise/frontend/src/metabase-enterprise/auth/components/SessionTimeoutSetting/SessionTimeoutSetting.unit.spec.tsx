import { render, screen } from "@testing-library/react";

import SessionTimeoutSetting from "metabase-enterprise/auth/components/SessionTimeoutSetting";

describe("SessionTimeoutSetting", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  const SUCCEED_TEST_CASES = [
    { value: { amount: 1, unit: "minutes" } },
    { value: { amount: 1, unit: "hours" } },
    { value: { amount: 60 * 24 * 365.25 * 100 - 1, unit: "minutes" } },
    { value: { amount: 24 * 365.25 * 100 - 1, unit: "hours" } },
  ];

  const FAIL_TEST_CASES = [
    {
      value: { amount: 0, unit: "minutes" },
      error: "Timeout must be greater than 0",
    },
    {
      value: { amount: 0, unit: "hours" },
      error: "Timeout must be greater than 0",
    },
    {
      value: { amount: 60 * 24 * 365.25 * 100, unit: "minutes" },
      error: "Timeout must be less than 100 years",
    },
    {
      value: { amount: 24 * 365.25 * 100, unit: "hours" },
      error: "Timeout must be less than 100 years",
    },
  ];

  SUCCEED_TEST_CASES.map(({ value }) => {
    it(`validates ${value.amount} ${value.unit} correctly`, () => {
      const setting = { value: value, key: "...", default: "..." };
      render(<SessionTimeoutSetting setting={setting} onChange={jest.fn()} />);
      expect(screen.queryByText(/Timeout must be/)).not.toBeInTheDocument();
    });
  });

  FAIL_TEST_CASES.map(({ value, error }) => {
    it(`validates ${value.amount} ${value.unit} correctly`, () => {
      const setting = { value: value, key: "...", default: "..." };
      render(<SessionTimeoutSetting setting={setting} onChange={jest.fn()} />);
      expect(screen.getByText(error)).toBeInTheDocument();
    });
  });
});
