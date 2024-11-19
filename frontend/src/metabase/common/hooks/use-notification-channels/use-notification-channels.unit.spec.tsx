import { setupNotificationChannelsEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";

import { useHasAnyNotificationChannel } from "./use-notification-channels";
const MockComponent = () => {
  const hasChannel = useHasAnyNotificationChannel();
  return <div>Has Channel: {hasChannel ? "yes" : "no"}</div>;
};

describe("useHasAnyNotificationChannel", () => {
  it("should return true if there are any notification channels", async () => {
    setupNotificationChannelsEndpoints({
      slack: { configured: true },
      email: { configured: false },
    } as any);

    renderWithProviders(<MockComponent />);
    expect(await screen.findByText("Has Channel: yes")).toBeInTheDocument();
  });

  it("should return true if there are multiple notification channels", async () => {
    setupNotificationChannelsEndpoints({
      slack: { configured: true },
      email: { configured: true },
    } as any);

    renderWithProviders(<MockComponent />);
    expect(await screen.findByText("Has Channel: yes")).toBeInTheDocument();
  });

  it("should return false if there are no notification channels", async () => {
    setupNotificationChannelsEndpoints({
      slack: { configured: false },
      email: { configured: false },
    } as any);

    renderWithProviders(<MockComponent />);
    expect(await screen.findByText("Has Channel: no")).toBeInTheDocument();
  });
});
