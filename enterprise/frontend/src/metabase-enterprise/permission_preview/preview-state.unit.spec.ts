import {
  type PreviewState,
  clearPreviewState,
  getPreviewAsHeaderHandler,
  getPreviewUrl,
  readPreviewState,
} from "./preview-state";

const STORAGE_KEY = "metabase.permissionPreview";

const STATE: PreviewState = {
  userId: 7,
  userName: "Sales",
  principalType: "group",
  principalId: 5,
  principalName: "Sales",
  attributes: { category: "Gizmo" },
  returnPath: "/admin/permissions/data/group/5",
};

describe("permission preview state", () => {
  afterEach(() => {
    clearPreviewState();
    window.history.replaceState(null, "", "/");
  });

  it("reads the preview from the URL a view-as switch loads with, then drops the parameters from the URL", () => {
    const url = new URL(getPreviewUrl("/dashboard/1?tab=2", STATE));
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);

    expect(readPreviewState()).toEqual(STATE);
    expect(window.location.pathname).toBe("/dashboard/1");
    expect(window.location.search).toBe("?tab=2");
  });

  it("keeps the preview for the tab after the URL parameters are gone, so a reload still previews", () => {
    const url = new URL(getPreviewUrl("/", STATE));
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    readPreviewState();

    expect(readPreviewState()).toEqual(STATE);
  });

  it("reads no preview in a normal tab, or after exiting", () => {
    expect(readPreviewState()).toBeNull();

    const url = new URL(getPreviewUrl("/", STATE));
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    readPreviewState();
    clearPreviewState();

    expect(readPreviewState()).toBeNull();
  });

  it("reads the stored user and group previews as they were stored", () => {
    const userState: PreviewState = {
      ...STATE,
      principalType: "user",
      principalId: 7,
    };

    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(STATE));
    expect(readPreviewState()).toEqual(STATE);

    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(userState));
    expect(readPreviewState()).toEqual(userState);
  });

  it("reads no preview from a tenant preview stored by a tab opened before the Tenant tab was removed, and clears it", () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...STATE, principalType: "tenant", principalId: 1 }),
    );

    expect(readPreviewState()).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("reads no preview, and stores none, from a tenant preview link opened before the Tenant tab was removed", () => {
    window.history.replaceState(
      null,
      "",
      "/?preview_as_user=9&preview_as_user_name=Acme%20preview&preview_as_principal_type=tenant&preview_as_principal_id=1&preview_as_principal=Acme&preview_as_attributes=%7B%7D&preview_return=%2F",
    );

    expect(readPreviewState()).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("reads the user and group preview links as they were linked", () => {
    const userState: PreviewState = {
      ...STATE,
      principalType: "user",
      principalId: 7,
    };

    [STATE, userState].forEach((state) => {
      const url = new URL(getPreviewUrl("/", state));
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);

      expect(readPreviewState()).toEqual(state);
    });
  });

  it("exits to the site's home page when the return path points at another site", () => {
    const url = new URL(
      getPreviewUrl("/", { ...STATE, returnPath: "//evil.example/" }),
    );
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);

    expect(readPreviewState()?.returnPath).toBe("/");
  });

  it("ignores a user id that isn't a number", () => {
    window.history.replaceState(null, "", "/?preview_as_user=rasta");

    expect(readPreviewState()).toBeNull();
  });

  it("sends the previewed user's id in the X-Metabase-Preview-As header", async () => {
    const handler = getPreviewAsHeaderHandler(STATE);

    expect(
      await handler({ method: "GET", url: "/api/user/current", data: {} }),
    ).toEqual({ headers: { "X-Metabase-Preview-As": "7" } });
  });

  it("sends the admin's own permission check as the admin, without the header", async () => {
    const handler = getPreviewAsHeaderHandler(STATE);

    expect(
      await handler({
        method: "GET",
        url: "/api/ee/permission_debug",
        data: { user_id: 10, model_id: 12, action_type: "collection/read" },
      }),
    ).toBeUndefined();
  });

  it("sends the admin's other debugging calls as the admin, without the header", async () => {
    const handler = getPreviewAsHeaderHandler(STATE);

    expect(
      await handler({
        method: "GET",
        url: "/api/ee/permission_debug/preview/data",
        data: {},
      }),
    ).toBeUndefined();
  });
});
