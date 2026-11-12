import type { ChannelRecipient, User } from "metabase-types/api";

export const isUserRecipient = (
  recipient: ChannelRecipient,
): recipient is User => "id" in recipient;
