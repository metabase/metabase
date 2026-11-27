import {
  createLocationMessage,
  createReadyMessage,
  createTokenMessage,
  isLocationMessage,
  isReadyMessage,
  isTokenMessage,
} from "./messages";

describe("frame messages", () => {
  it("recognises each message it creates and no other", () => {
    expect(isReadyMessage(createReadyMessage())).toBe(true);
    expect(isTokenMessage(createTokenMessage("mbpv_x"))).toBe(true);
    expect(isLocationMessage(createLocationMessage("dashboard/1"))).toBe(true);

    expect(isTokenMessage(createReadyMessage())).toBe(false);
    expect(isLocationMessage(createTokenMessage("mbpv_x"))).toBe(false);
    expect(isReadyMessage(createLocationMessage("dashboard/1"))).toBe(false);
  });

  it("refuses data of another shape", () => {
    expect(isTokenMessage({ type: "permission-preview-token" })).toBe(false);
    expect(isTokenMessage({ type: "permission-preview-token", token: 5 })).toBe(
      false,
    );
    expect(isTokenMessage(null)).toBe(false);
    expect(isTokenMessage("permission-preview-token")).toBe(false);
  });
});
