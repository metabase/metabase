import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SlackSetup from "./SlackSetup";

const FormMock = () => <div />;

describe("SlackSetup", () => {
  it("should toggle setup sections", async () => {
    render(<SlackSetup Form={FormMock} />);
    expect(screen.getByText("Install to workspace")).toBeInTheDocument();

    await userEvent.click(
      screen.getByText("1. Click the button below and create your Slack App"),
    );
    expect(screen.queryByText("Install to workspace")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByText("1. Click the button below and create your Slack App"),
    );
    expect(screen.getByText("Install to workspace")).toBeInTheDocument();
  });

  it("should render the page when there is no existing bot", () => {
    render(<SlackSetup Form={FormMock} isBot={false} />);

    expect(screen.getByText(/Metabase to your Slack/)).toBeInTheDocument();
  });

  it("should render the page when there is an existing bot", () => {
    render(<SlackSetup Form={FormMock} isBot={true} />);

    expect(screen.getByText("upgrade to Slack Apps")).toBeInTheDocument();
  });
});
