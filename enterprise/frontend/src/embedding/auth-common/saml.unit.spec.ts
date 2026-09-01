import { openSamlLoginPopup } from "./saml";

const instanceUrl = "https://metabase.example.com";
const idpUrl = "https://idp.example.com/login";
const mismatchedPopupUrl = "https://saml.metabase.example.com/auth/sso";

const authData = { id: "session-id", iat: 0, exp: 0 };

describe("openSamlLoginPopup", () => {
  const popup = { closed: false, close: jest.fn() };

  // The mock is used as the browser popup.
  const popupWindow = popup as unknown as Window;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    popup.closed = false;

    jest.spyOn(window, "open").mockReturnValue(popupWindow);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("completes the saml popup when origin and source matches", async () => {
    const login = openSamlLoginPopup(idpUrl, instanceUrl);

    let completed = false;

    login.then(() => {
      completed = true;
    });

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "SAML_AUTH_COMPLETE", authData },
        origin: "https://other.example.com",
        source: popupWindow,
      }),
    );

    await Promise.resolve();
    expect(completed).toBe(false);
    expect(popup.close).not.toHaveBeenCalled();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "SAML_AUTH_COMPLETE", authData },
        origin: instanceUrl,
        source: window,
      }),
    );

    await Promise.resolve();
    expect(completed).toBe(false);
    expect(popup.close).not.toHaveBeenCalled();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "SAML_AUTH_COMPLETE", authData },
        origin: instanceUrl,
        source: popupWindow,
      }),
    );

    await expect(login).resolves.toEqual(authData);
    expect(popup.close).toHaveBeenCalledTimes(1);
  });

  it("ignores message events from a different origin", async () => {
    const login = openSamlLoginPopup(idpUrl, instanceUrl);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "SAML_AUTH_COMPLETE", authData },
        origin: "https://other.example.com",
        source: popupWindow,
      }),
    );

    popup.closed = true;
    jest.advanceTimersByTime(1000);

    await expect(login).rejects.toMatchObject({
      code: "SAML_POPUP_CLOSED",
    });
  });

  it("reports a Site URL origin mismatch before opening the popup", async () => {
    await expect(
      openSamlLoginPopup(idpUrl, instanceUrl, mismatchedPopupUrl),
    ).rejects.toMatchObject({
      code: "SAML_SITE_URL_MISMATCH",
    });

    expect(window.open).not.toHaveBeenCalled();
  });
});
