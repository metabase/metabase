import { api } from "metabase/api/client";

import { prepareEmbeddedDataApp } from "./prepare-embedded-data-app";

describe("prepareEmbeddedDataApp", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    document.head
      .querySelectorAll('meta[http-equiv="Content-Security-Policy"]')
      .forEach((meta) => meta.remove());
  });

  it("installs the authenticated policy before returning and leaves ancestor enforcement to HTTP", async () => {
    const fetch = jest.spyOn(api, "fetch").mockResolvedValue(
      new Response("", {
        headers: {
          "Content-Security-Policy":
            "default-src 'none'; connect-src 'self' https://api.example.com; form-action 'none'; frame-ancestors https://host.example.com;",
          "X-Metabase-Data-App-Policy": "authenticated",
        },
      }),
    );

    await prepareEmbeddedDataApp("sales");

    expect(fetch).toHaveBeenCalledWith({
      method: "GET",
      url: "/embed/embedded-apps/sales",
      cache: "no-store",
    });
    expect(
      document.head.querySelector<HTMLMetaElement>(
        'meta[http-equiv="Content-Security-Policy"]',
      )?.content,
    ).toBe(
      "default-src 'none'; connect-src 'self' https://api.example.com; form-action 'none'; ",
    );
  });

  it("identifies a missing or disabled app in a policy 404", async () => {
    jest
      .spyOn(api, "fetch")
      .mockResolvedValue(new Response("Not found.", { status: 404 }));

    await expect(prepareEmbeddedDataApp("boba-ops")).rejects.toThrow(
      'Data app "boba-ops" was not found or is disabled. Check the app name in path.',
    );
    expect(
      document.head.querySelector('meta[http-equiv="Content-Security-Policy"]'),
    ).toBeNull();
  });

  it.each([
    new Response("", { status: 403 }),
    new Response("", {
      headers: {
        "Content-Security-Policy": "default-src *;",
        "X-Metabase-Data-App-Policy": "bootstrap",
      },
    }),
    new Response("", {
      headers: { "X-Metabase-Data-App-Policy": "authenticated" },
    }),
  ])(
    "rejects unavailable or unauthenticated policy responses",
    async (response) => {
      jest.spyOn(api, "fetch").mockResolvedValue(response);

      await expect(prepareEmbeddedDataApp("sales")).rejects.toThrow();

      expect(
        document.head.querySelector(
          'meta[http-equiv="Content-Security-Policy"]',
        ),
      ).toBeNull();
    },
  );
});
