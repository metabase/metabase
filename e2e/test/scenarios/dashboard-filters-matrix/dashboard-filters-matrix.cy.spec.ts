import { SETUP_GROUPS, runGroup } from "./helpers/matrix-helpers";

describe("scenarios > dashboard > parameters > matrix", () => {
  SETUP_GROUPS.forEach((group) => {
    it(`parameters on a ${group.adminType} field with ${group.results} results should render the expected widget`, () => {
      runGroup(group);
    });
  });
});
