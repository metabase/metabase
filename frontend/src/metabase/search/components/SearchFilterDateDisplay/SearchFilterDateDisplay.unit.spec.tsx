import { render, screen } from "@testing-library/react";

import type { SearchFilterDateDisplayProps } from "./SearchFilterDateDisplay";
import { SearchFilterDateDisplay } from "./SearchFilterDateDisplay";

const TEST_TITLE = "SearchFilterDateDisplay Title";

const TEST_DATE_FILTER_DISPLAY: [string | null | undefined, string][] = [
  ["thisday", "Today"],
  ["past1days", "Yesterday"],
  ["past1weeks", "Previous Week"],
  ["past7days", "Previous 7 Days"],
  ["past30days", "Previous 30 Days"],
  ["past1months", "Previous Month"],
  ["past3months", "Previous 3 Months"],
  ["past12months", "Previous 12 Months"],
  ["2023-08-30~2023-09-29", "August 30, 2023 - September 29, 2023"],
  ["past123quarters", "Previous 123 Quarters"],
  ["invalidSuperString", TEST_TITLE],
  [null, TEST_TITLE],
  [undefined, TEST_TITLE],
];
const setup = ({
  value = null,
}: Partial<SearchFilterDateDisplayProps> = {}) => {
  render(<SearchFilterDateDisplay label={TEST_TITLE} value={value} />);
};

describe("SearchFilterDateDisplay", () => {
  it.each(TEST_DATE_FILTER_DISPLAY)(
    "displays correct title when value is %s",
    (value, title) => {
      setup({ value });
      expect(screen.getByText(title)).toBeInTheDocument();
    },
  );
});
