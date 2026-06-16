import Settings from "metabase/utils/settings";

import {
  initMetaplow,
  trackMetaplowEvent,
  trackMetaplowPageView,
} from "./metaplow";

const METAPLOW_URL = "https://metaplow.example.com/api/send";
const METAPLOW_WEBSITE_ID = "23eefa30-4c4f-490e-aa4f-084cd23b1561";
const ANON_ORIGIN = "http://anonymous.metabase.com";

describe("metaplow", () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    Settings.set("metaplow-url", METAPLOW_URL);
    fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    Settings.set("metaplow-url", null);
  });

  const getSentPayload = () => {
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(METAPLOW_URL);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    return JSON.parse(init?.body as string);
  };

  describe("initMetaplow", () => {
    describe("beforeSend", () => {
      afterEach(() => {
        initMetaplow({ beforeSend: (_type, payload) => payload });
      });

      it("can modify the payload before it's sent", () => {
        initMetaplow({
          beforeSend: (_type, payload) => ({
            ...payload,
            data: { ...payload.data, user_id: 123 },
          }),
        });

        trackMetaplowEvent("button_clicked");

        const { payload } = getSentPayload();
        expect(payload.data.user_id).toBe(123);
      });

      it("suppresses the fetch call when a falsy value is returned", () => {
        initMetaplow({ beforeSend: () => undefined });

        trackMetaplowEvent("button_clicked");

        expect(fetchSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe("trackMetaplowEvent", () => {
    it("does not call fetch when metaplow-url is not set", () => {
      Settings.set("metaplow-url", null);
      trackMetaplowEvent("button_clicked");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("sends an event with the given name and default empty data", () => {
      trackMetaplowEvent("button_clicked");

      const body = getSentPayload();
      expect(body.type).toBe("event");
      expect(body.payload).toEqual(
        expect.objectContaining({
          website: METAPLOW_WEBSITE_ID,
          name: "button_clicked",
          data: {},
          referrer: "",
          title: "",
          hostname: "anonymous.metabase.com",
          tag: "metabase-instance",
        }),
      );
    });

    it("forwards the data payload", () => {
      trackMetaplowEvent("button_clicked", { foo: "bar", count: 3 });

      const { payload } = getSentPayload();
      expect(payload.data).toEqual({ foo: "bar", count: 3 });
    });

    it("includes screen and language from the browser", () => {
      trackMetaplowEvent("button_clicked");

      const { payload } = getSentPayload();
      expect(payload.screen).toBe(
        `${window.screen.width}x${window.screen.height}`,
      );
      expect(payload.language).toBe(navigator.language);
    });

    it("uses an anonymized hostname in the url", () => {
      trackMetaplowEvent("button_clicked");

      const { payload } = getSentPayload();
      expect(payload.url.startsWith(ANON_ORIGIN)).toBe(true);
    });
  });

  describe("trackMetaplowPageView", () => {
    it("does not call fetch when metaplow-url is not set", async () => {
      Settings.set("metaplow-url", null);
      await trackMetaplowPageView("/question/42-my-question");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('sends an event with name "pageview"', async () => {
      await trackMetaplowPageView("/dashboard/1");

      const { payload } = getSentPayload();
      expect(payload.name).toBe("pageview");
      expect(payload.url).toBe(`${ANON_ORIGIN}/dashboard/1`);
    });

    it("strips slugs from /:id-slug paths", async () => {
      await trackMetaplowPageView("/question/42-my-favorite-question");

      const { payload } = getSentPayload();
      expect(payload.url).toBe(`${ANON_ORIGIN}/question/42`);
    });

    it("anonymizes absolute URLs by replacing the origin", async () => {
      await trackMetaplowPageView(
        "https://my-company.metabaseapp.com/collection/5-secrets",
      );

      const { payload } = getSentPayload();
      expect(payload.url).toBe(`${ANON_ORIGIN}/collection/5`);
    });

    it("preserves paths without a numeric slug prefix", async () => {
      await trackMetaplowPageView("/admin/settings/general");

      const { payload } = getSentPayload();
      expect(payload.url).toBe(`${ANON_ORIGIN}/admin/settings/general`);
    });
  });
});
