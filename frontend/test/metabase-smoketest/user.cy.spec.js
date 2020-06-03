import { restore, USER, signInAsNormalUser } from "__support__/cypress";

describe("smoketest > new_user", () => {
    before(restore);
    before(signInAsNormalUser);
  
    it("should be able to do header actions", () => {

        // =================
        // should ensuring that header actions are appropriate for different data types
        // =================



        // =================
        // should filter via both the sidebar and the header
        // =================



        // =================
        // should summarize via both the sidebar and the header
        // =================



        // =================
        // should be able to create custom columns in the notebook editor
        // =================

        // =================
        // should be able to create custom JOINs in the notebook editor
        // =================
    });
});
