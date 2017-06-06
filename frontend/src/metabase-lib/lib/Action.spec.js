import Action from "./Action";

describe("Action", () => {
    describe("perform", () => {
        it("should perform the action", () => {
            new Action().perform();
        });
    });
});
