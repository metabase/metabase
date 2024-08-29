import type { ValidateSchema } from "./utils";

type AccountEventSchema = {
  event: string;
  version?: string | null;
  link?: string | null;
};

type ValidateEvent<T extends AccountEventSchema> = ValidateSchema<
  T,
  AccountEventSchema
>;

export type NewUserCreatedEvent = ValidateEvent<{
  event: "new_user_created";
}>;

export type NewInstanceCreatedEvent = ValidateEvent<{
  event: "new_instance_created";
}>;

export type AccountEvent = NewUserCreatedEvent | NewInstanceCreatedEvent;
