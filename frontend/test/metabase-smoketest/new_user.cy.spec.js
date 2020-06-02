import { restore, signInAsNormalUser } from "__support__/cypress";

describe("metabase-smoketest > new_user", () => {
    before(() => restore("blank"));

    it("should be able to do core useage", () => {
        // =================
        // Login
        // =================



        // =================
        // View questions currently in the "Our Analytics" collection
        // =================



        // =================
        // View dashboard in the "Our Analytics" collection
        // =================



        // =================
        // Create my own question
        // =================



        // =================
        // Create my own dashboard
        // =================
    });
});
