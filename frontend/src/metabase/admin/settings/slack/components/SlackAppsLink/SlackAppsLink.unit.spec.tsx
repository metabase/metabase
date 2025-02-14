import { render, screen } from "__support__/ui";

import SlackAppsLink from "./SlackAppsLink";

describe("SlackAppsLink", () => {
  it("renders correctly", () => {
    render(<SlackAppsLink />);

    expect(screen.getByText("Create Slack App")).toBeInTheDocument();
  });
});
