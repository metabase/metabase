import { render, screen, waitFor } from "__support__/ui";
import { getNextId } from "__support__/utils";
import { createMockAlert } from "metabase-types/api/mocks/alert";
import { createMockDashboardSubscription } from "metabase-types/api/mocks/pulse";
import { createMockUser } from "metabase-types/api/mocks/user";

import { UnsubscribeModal } from "./UnsubscribeModal";

describe("UnsubscribeModal", () => {
  it("should render an alert", () => {
    const alert = createMockAlert();

    render(
      <UnsubscribeModal
        item={alert}
        type="alert"
        user={createMockUser()}
        onUnsubscribe={jest.fn()}
        onArchive={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(
      screen.getByText("this alert", { exact: false }),
    ).toBeInTheDocument();
  });

  it("should render a pulse", () => {
    const pulse = createMockDashboardSubscription();

    render(
      <UnsubscribeModal
        item={pulse}
        type="pulse"
        user={createMockUser()}
        onUnsubscribe={jest.fn()}
        onArchive={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(
      screen.getByText("this subscription", { exact: false }),
    ).toBeInTheDocument();
  });

  it("should close if unsubscribed successfully", async () => {
    const alert = createMockAlert({ creator_id: getNextId() });
    const user = createMockUser({ id: getNextId() });
    const onUnsubscribe = jest.fn();
    const onArchive = jest.fn();
    const onClose = jest.fn();

    onUnsubscribe.mockResolvedValue(undefined);

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
    expect(onArchive).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("should proceed with archiving if the notification is created by the user", async () => {
    const user = createMockUser({ id: getNextId() });
    const alert = createMockAlert({ creator_id: user.id, creator: user });
    const onUnsubscribe = jest.fn();
    const onArchive = jest.fn();
    const onClose = jest.fn();

    onUnsubscribe.mockResolvedValue(undefined);

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
    const user = createMockUser({ id: getNextId() });
    const alert = createMockAlert({ creator_id: user.id, creator: user });
    const onUnsubscribe = jest.fn();
    const onArchive = jest.fn();
    const onClose = jest.fn();

    onUnsubscribe.mockRejectedValue({
      status: 500,
      data: { message: "An error occurred" },
    });

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
