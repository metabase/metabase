export interface User {
  id: number;
}

export const createUser = (opts?: Partial<User>): User => ({
  id: 1,
  ...opts,
});
