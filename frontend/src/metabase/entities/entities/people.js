export const name = "users";
export const path = "/api/user";

export const getName = user => `${user.first_name} ${user.last_name}`;

export const form = {
  fields: [{ name: "first_name" }, { name: "last_name" }, { name: "email" }],
};
