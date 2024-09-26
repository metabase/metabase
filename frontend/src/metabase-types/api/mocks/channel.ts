import type { ChannelDetails, NotificationChannel } from "../notifications";

export const createMockChannelDetails = (
  opts: Partial<ChannelDetails>,
): ChannelDetails => ({
  url: "http://google.com",
  "auth-method": "none",
  "fe-form-type": "none",
  ...opts,
});

export const createMockChannel = (
  opts: Partial<NotificationChannel>,
): NotificationChannel => ({
  id: 1,
  name: "Awesome Hook",
  description: "A great hook",
  active: true,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  details: createMockChannelDetails({}),
  type: "channel/http",
  ...opts,
});
