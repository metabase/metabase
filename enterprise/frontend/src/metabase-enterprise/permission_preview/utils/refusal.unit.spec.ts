import { getRefusalMessage } from "./refusal";

describe("getRefusalMessage", () => {
  it.each([
    [
      "preview-target-admin",
      "Admins can't be previewed, because they can see everything.",
    ],
    [
      "preview-target-deactivated",
      "Only active users who aren't admins can be previewed.",
    ],
    [
      "preview-target-tenant-unavailable",
      "Only active users who aren't admins can be previewed.",
    ],
    [
      "preview-target-tenant-group-empty",
      "This tenant group can't be previewed until it has at least one user.",
    ],
  ])("says what %s means", (errorCode, message) => {
    expect(
      getRefusalMessage({ status: 400, data: { "error-code": errorCode } }),
    ).toBe(message);
  });

  it("falls back for an error it doesn't know", () => {
    expect(getRefusalMessage({ status: 500, data: "boom" })).toBe(
      "This preview couldn't be started.",
    );
    expect(getRefusalMessage(new Error("network"))).toBe(
      "This preview couldn't be started.",
    );
  });
});
