import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SlackStatus from "./SlackStatus";

const FormMock = () => <div />;

describe("SlackStatus", () => {
  it("should render the status for a working app", () => {
    const onDelete = jest.fn();

    render(<SlackStatus Form={FormMock} isValid={true} onDelete={onDelete} />);

    expect(screen.getByText("Slack app is working")).toBeInTheDocument();
  });

  it("should render the status for a non-working app", () => {
    const onDelete = jest.fn();

    render(<SlackStatus Form={FormMock} isValid={false} onDelete={onDelete} />);

    expect(screen.getByText("See our docs")).toBeInTheDocument();
  });

  it("should open the modal and delete the app", async () => {
    const onDelete = jest.fn();

    render(<SlackStatus Form={FormMock} isValid={true} onDelete={onDelete} />);
    await userEvent.click(screen.getByText("Delete Slack App"));
    await userEvent.click(screen.getByText("Delete"));

    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });
});
