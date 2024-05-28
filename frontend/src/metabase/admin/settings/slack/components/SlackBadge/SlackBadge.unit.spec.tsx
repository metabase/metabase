import { render, screen } from "@testing-library/react";

import SlackBadge from "./SlackBadge";

describe("SlackBadge", () => {
  it("should render when there is a bot and the token is valid", () => {
    render(<SlackBadge isBot={true} isValid={true} />);

    expect(screen.getByText("Slack bot is working.")).toBeInTheDocument();
  });

  it("should render when there is an app and the token is valid", () => {
    render(<SlackBadge isBot={false} isValid={true} />);

    expect(screen.getByText("Slack app is working")).toBeInTheDocument();
  });

  it("should render when there is a bot and the token is invalid", () => {
    render(<SlackBadge isBot={true} isValid={false} />);

    expect(screen.getByText("Slack bot is not working.")).toBeInTheDocument();
  });

  it("should render when there is an app and the token is invalid", () => {
    render(<SlackBadge isBot={false} isValid={false} />);

    expect(screen.getByText("Slack app is not working.")).toBeInTheDocument();
  });
});
