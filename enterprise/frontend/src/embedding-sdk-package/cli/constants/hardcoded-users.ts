import { SANDBOXED_GROUP_NAMES } from "./config";

const [GROUP_A, GROUP_B, GROUP_C] = SANDBOXED_GROUP_NAMES;

/**
 * Sample hardcoded users for JWT authentication.
 */
export const HARDCODED_USERS = [
  {
    id: 1,
    email: "alice@example.com",
    firstName: "Alice",
    lastName: "Johnson",
    groups: [GROUP_A],
  },
  {
    id: 2,
    email: "bob@example.com",
    firstName: "Bob",
    lastName: "Smith",
    groups: [GROUP_B],
  },
  {
    id: 3,
    email: "charlie@example.com",
    firstName: "Charlie",
    lastName: "Rogers",
    groups: [GROUP_C],
  },
];
