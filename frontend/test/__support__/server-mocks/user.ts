import fetchMock from "fetch-mock";
import { User } from "metabase-types/api";

export function setupCurrentUserEndpoint(user: User) {
  fetchMock.get("path:/api/user/current", user);
}
