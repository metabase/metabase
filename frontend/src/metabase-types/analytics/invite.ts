import type { ValidateSchema } from "./utils";

type InviteEventSchema = {
  event: string;
  invited_user_id: number;
  source?: string | null;
};

type ValidateEvent<T extends InviteEventSchema> = ValidateSchema<
  T,
  InviteEventSchema
>;

export type InviteSentEvent = ValidateEvent<{
  event: "invite_sent";
  invited_user_id: number;
  source: "setup" | "admin";
}>;

export type InviteEvent = InviteSentEvent;
