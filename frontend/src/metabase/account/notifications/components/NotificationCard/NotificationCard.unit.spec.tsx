import { fireEvent, screen } from "@testing-library/react";

import { renderWithTheme } from "__support__/ui";
import type { QuestionNotificationListItem } from "metabase/account/notifications/types";
import type { Notification } from "metabase-types/api";
import {
  createMockNotification,
  createMockNotificationCronSubscription,
  createMockNotificationHandlerEmail,
  createMockNotificationHandlerSlack,
  createMockNotificationRecipientUser,
  createMockUser,
} from "metabase-types/api/mocks";

import { NotificationCard } from "./NotificationCard";

const getQuestionAlertItem = (
  opts?: Partial<Notification>,
): QuestionNotificationListItem => ({
  item: createMockNotification(opts),
  type: "question-notification",
});

describe("NotificationCard", () => {
  it("should render a question alert", () => {
    const alert = getQuestionAlertItem();
    const user = createMockUser();

    renderWithTheme(
      <NotificationCard
        listItem={alert}
        user={user}
        isEditable
        onArchive={jest.fn()}
        onUnsubscribe={jest.fn()}
      />,
    );

    expect(screen.getByLabelText("mail icon")).toBeInTheDocument();
    expect(screen.getByText("Check daily at 9:00 AM")).toBeInTheDocument();
    expect(
      screen.getByText("Created by you on January 7, 2025"),
    ).toBeInTheDocument();
  });

  it("should render a slack alert", () => {
    const alert = getQuestionAlertItem({
      handlers: [createMockNotificationHandlerSlack()],
    });
    const user = createMockUser();

    renderWithTheme(
      <NotificationCard
        listItem={alert}
        user={user}
        isEditable
        onArchive={jest.fn()}
        onUnsubscribe={jest.fn()}
      />,
    );

    expect(screen.getByLabelText("slack icon")).toBeInTheDocument();
    expect(screen.getByText("Check daily at 9:00 AM")).toBeInTheDocument();
  });

  it("should render an hourly alert", () => {
    const alert = getQuestionAlertItem({
      subscriptions: [
        createMockNotificationCronSubscription({
          cron_schedule: "0 * * * * ?",
        }),
      ],
    });
    const user = createMockUser();

    renderWithTheme(
      <NotificationCard
        listItem={alert}
        user={user}
        isEditable
        onArchive={jest.fn()}
        onUnsubscribe={jest.fn()}
      />,
    );

    expect(screen.getByText("Check hourly")).toBeInTheDocument();
  });

  it("should render a weekly alert", () => {
    const alert = getQuestionAlertItem({
      subscriptions: [
        createMockNotificationCronSubscription({
          cron_schedule: "0 0 9 ? * 2",
        }),
      ],
    });
    const user = createMockUser();

    renderWithTheme(
      <NotificationCard
        listItem={alert}
        user={user}
        isEditable
        onArchive={jest.fn()}
        onUnsubscribe={jest.fn()}
      />,
    );

    expect(screen.getByText("Check on Monday at 9:00 AM")).toBeInTheDocument();
  });

  it("should render an alert created by another user", () => {
    const alert = getQuestionAlertItem({
      creator: createMockUser({
        common_name: "John Doe",
      }),
    });
    const user = createMockUser({ id: 2 });

    renderWithTheme(
      <NotificationCard
        listItem={alert}
        user={user}
        isEditable
        onArchive={jest.fn()}
        onUnsubscribe={jest.fn()}
      />,
    );

    expect(
      screen.getByText("Created by John Doe on January 7, 2025"),
    ).toBeInTheDocument();
  });

  it("should unsubscribe when the user is not the creator and subscribed", () => {
    const creator = createMockUser({ id: 1 });
    const user = createMockUser({ id: 2 });
    const alert = getQuestionAlertItem({
      creator,
      handlers: [
        createMockNotificationHandlerEmail({
          recipients: [
            createMockNotificationRecipientUser({
              user_id: user.id,
              user,
            }),
          ],
        }),
      ],
    });
    const onUnsubscribe = jest.fn();
    const onArchive = jest.fn();

    renderWithTheme(
      <NotificationCard
        listItem={alert}
        user={user}
        isEditable
        onUnsubscribe={onUnsubscribe}
        onArchive={onArchive}
      />,
    );

    fireEvent.click(screen.getByLabelText("close icon"));
    expect(onUnsubscribe).toHaveBeenCalledWith(alert);
    expect(onArchive).not.toHaveBeenCalled();
  });

  it("should unsubscribe when user is the creator and subscribed with another user", () => {
    const creator = createMockUser({ id: 1 });
    const recipient = createMockUser({ id: 2 });
    const alert = getQuestionAlertItem({
      creator,
      handlers: [
        createMockNotificationHandlerEmail({
          recipients: [
            createMockNotificationRecipientUser({
              user_id: creator.id,
              user: creator,
            }),
            createMockNotificationRecipientUser({
              user_id: recipient.id,
              user: recipient,
            }),
          ],
        }),
      ],
    });
    const onUnsubscribe = jest.fn();
    const onArchive = jest.fn();

    renderWithTheme(
      <NotificationCard
        listItem={alert}
        user={creator}
        onUnsubscribe={onUnsubscribe}
        onArchive={onArchive}
        isEditable
      />,
    );

    fireEvent.click(screen.getByLabelText("close icon"));
    expect(onUnsubscribe).toHaveBeenCalledWith(alert);
    expect(onArchive).not.toHaveBeenCalled();
  });

  it("should hide archive button when not editable", () => {
    const creator = createMockUser();
    const alert = getQuestionAlertItem({ creator });
    const onUnsubscribe = jest.fn();
    const onArchive = jest.fn();

    renderWithTheme(
      <NotificationCard
        listItem={alert}
        user={creator}
        isEditable={false}
        onUnsubscribe={onUnsubscribe}
        onArchive={onArchive}
      />,
    );

    expect(screen.queryByLabelText("close icon")).not.toBeInTheDocument();
  });

  it("should archive when the user is the creator and not subscribed", () => {
    const creator = createMockUser();
    const alert = getQuestionAlertItem({ creator });
    const onUnsubscribe = jest.fn();
    const onArchive = jest.fn();

    renderWithTheme(
      <NotificationCard
        listItem={alert}
        user={creator}
        onUnsubscribe={onUnsubscribe}
        onArchive={onArchive}
        isEditable
      />,
    );

    fireEvent.click(screen.getByLabelText("close icon"));
    expect(onUnsubscribe).not.toHaveBeenCalled();
    expect(onArchive).toHaveBeenCalledWith(alert);
  });

  it("should archive when the user is the creator and is the only one subscribed", () => {
    const creator = createMockUser();
    const alert = getQuestionAlertItem({
      creator,
      handlers: [
        createMockNotificationHandlerEmail({
          recipients: [
            createMockNotificationRecipientUser({
              user_id: creator.id,
              user: creator,
            }),
          ],
        }),
      ],
    });
    const onUnsubscribe = jest.fn();
    const onArchive = jest.fn();

    renderWithTheme(
      <NotificationCard
        listItem={alert}
        user={creator}
        onUnsubscribe={onUnsubscribe}
        onArchive={onArchive}
        isEditable
      />,
    );

    fireEvent.click(screen.getByLabelText("close icon"));
    expect(onUnsubscribe).not.toHaveBeenCalled();
    expect(onArchive).toHaveBeenCalledWith(alert);
  });
});
