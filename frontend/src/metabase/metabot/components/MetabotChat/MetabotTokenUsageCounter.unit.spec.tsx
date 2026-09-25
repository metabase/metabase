import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { MetabotTokenUsageCounter } from "./MetabotTokenUsageCounter";

const USAGE = {
  inputTokens: 48213,
  outputTokens: 950,
  cacheCreationTokens: 2000,
  cacheReadTokens: 45013,
};

describe("MetabotTokenUsageCounter", () => {
  it("shows compact input and output totals", () => {
    renderWithProviders(<MetabotTokenUsageCounter usage={USAGE} />);

    expect(screen.getByTestId("metabot-token-usage")).toHaveTextContent(
      "48.2k in · 950 out",
    );
  });

  it("breaks the input down by cache usage on hover", async () => {
    renderWithProviders(<MetabotTokenUsageCounter usage={USAGE} />);

    await userEvent.hover(screen.getByTestId("metabot-token-usage"));

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Tokens used this session");
    expect(tooltip).toHaveTextContent("Input: 48,213");
    expect(tooltip).toHaveTextContent("Cache read: 45,013");
    expect(tooltip).toHaveTextContent("Cache write: 2,000");
    expect(tooltip).toHaveTextContent("Output: 950");
  });
});
