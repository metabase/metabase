import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import SlackStatus from "./SlackStatus";

const FormMock = () => <div />;

describe("SlackStatus", () => {
  it("should render the status for a working app", () => {
    const onDelete = jest.fn();

    renderWithProviders(
      <SlackStatus Form={FormMock} isValid={true} onDelete={onDelete} />,
    );

    expect(screen.getByText("Slack app is working")).toBeInTheDocument();
  });

  it("should render the status for a non-working app", () => {
    const onDelete = jest.fn();

    renderWithProviders(
      <SlackStatus Form={FormMock} isValid={false} onDelete={onDelete} />,
    );

    expect(screen.getByText("See our docs")).toBeInTheDocument();
  });

  it("should open the modal and delete the app", async () => {
    const onDelete = jest.fn();

    renderWithProviders(
      <SlackStatus Form={FormMock} isValid={true} onDelete={onDelete} />,
    );
    await userEvent.click(screen.getByText("Delete Slack App"));
    await userEvent.click(screen.getByText("Delete"));

    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });
});
