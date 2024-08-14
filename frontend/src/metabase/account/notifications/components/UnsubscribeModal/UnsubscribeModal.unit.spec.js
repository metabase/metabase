import { render, screen, waitFor } from "@testing-library/react";

import UnsubscribeModal from "./UnsubscribeModal";

const getAlert = ({ creator = getUser({ id: 1 }) } = {}) => ({
  name: "Alert",
  creator: creator,
});

const getPulse = ({ creator = getUser({ id: 1 }) } = {}) => ({
  name: "Pulse",
  creator: creator,
});

const getUser = ({ id = 2 } = {}) => ({
  id,
});

describe("UnsubscribeModal", () => {
  it("should render an alert", () => {
    const alert = getAlert();

    render(<UnsubscribeModal item={alert} type="alert" />);

    expect(
      screen.getByText("this alert", { exact: false }),
    ).toBeInTheDocument();
  });

  it("should render a pulse", () => {
    const pulse = getPulse();

    render(<UnsubscribeModal item={pulse} type="pulse" />);

    expect(
      screen.getByText("this subscription", { exact: false }),
    ).toBeInTheDocument();
  });

  it("should close if unsubscribed successfully", async () => {
    const alert = getAlert();
    const onUnsubscribe = jest.fn();
    const onArchive = jest.fn();
    const onClose = jest.fn();

    onUnsubscribe.mockResolvedValue();

    render(
      <UnsubscribeModal
        item={alert}
        type="alert"
        onUnsubscribe={onUnsubscribe}
        onArchive={onArchive}
        onClose={onClose}
      />,
    );

    screen.getByText("Unsubscribe").click();

    await waitFor(() => {
      expect(onUnsubscribe).toHaveBeenCalledWith(alert);
    });
    expect(onArchive).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("should proceed with archiving if the notification is created by the user", async () => {
    const user = getUser();
    const alert = getAlert({ creator: user });
    const onUnsubscribe = jest.fn();
    const onArchive = jest.fn();
    const onClose = jest.fn();

    onUnsubscribe.mockResolvedValue();

    render(
      <UnsubscribeModal
        item={alert}
        type="alert"
        user={user}
        onUnsubscribe={onUnsubscribe}
        onArchive={onArchive}
        onClose={onClose}
      />,
    );

    screen.getByText("Unsubscribe").click();

    await waitFor(() => {
      expect(onUnsubscribe).toHaveBeenCalledWith(alert);
    });
    expect(onArchive).toHaveBeenCalledWith(alert, "alert", true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("should not close on a submit error", async () => {
    const user = getUser();
    const alert = getAlert();
    const onUnsubscribe = jest.fn();
    const onArchive = jest.fn();
    const onClose = jest.fn();

    onUnsubscribe.mockRejectedValue({ data: { message: "An error occurred" } });

    render(
      <UnsubscribeModal
        item={alert}
        type="alert"
        user={user}
        onUnsubscribe={onUnsubscribe}
        onArchive={onArchive}
        onClose={onClose}
      />,
    );

    screen.getByText("Unsubscribe").click();

    await waitFor(() => {
      expect(screen.getByText("An error occurred")).toBeInTheDocument();
    });
    expect(onUnsubscribe).toHaveBeenCalled();
    expect(onArchive).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
