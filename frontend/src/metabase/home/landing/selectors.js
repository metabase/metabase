import { createSelector } from "reselect";
import { getUser } from "metabase/selectors/user";
import Greeting from "metabase/lib/greeting";

export const getGreeting = createSelector([getUser], user =>
  Greeting.sayHello(user.first_name),
);
