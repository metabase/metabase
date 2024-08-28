export type NewUserCreatedEvent = {
  event: "new_user_created";
};

export type NewInstanceCreatedEvent = {
  event: "new_instance_created";
};

export type AccountEvent = NewUserCreatedEvent | NewInstanceCreatedEvent;
