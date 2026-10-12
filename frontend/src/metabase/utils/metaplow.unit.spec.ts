import { reset } from "@metabase/track";

import Settings from "metabase/utils/settings";

import {
  getCollectorHostUrl,
  initMetaplow,
  trackMetaplowEvent,
  trackMetaplowPageView,
} from "./metaplow";

const METAPLOW_URL = "https://metaplow.example.com/api/send";
const METAPLOW_WEBSITE_ID = "23eefa30-4c4f-490e-aa4f-084cd23b1561";
const ANON_ORIGIN = "http://anonymous.metabase.com";
const RELAY_HOST_URL = "https://app.example.com/api/metaplow-proxy";

const setup = async ({
  userId,
  hostUrl = getCollectorHostUrl(),
}: { userId?: number; hostUrl?: string | null } = {}) => {
  initMetaplow({ hostUrl, getUserId: () => userId });
  await Promise.resolve();
};

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
    reset();
  });

  const getSentPayload = () => {
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(METAPLOW_URL);
    expect(init?.method).toBe("POST");
    // Unjustified type cast. FIXME
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    // Unjustified type cast. FIXME
    return JSON.parse(init?.body as string);
  };

  describe("getCollectorHostUrl", () => {
    it("strips the /send suffix the tracker library adds back on", () => {
      expect(getCollectorHostUrl()).toBe("https://metaplow.example.com/api");
    });

    it("is null when no collector is configured", () => {
      Settings.set("metaplow-url", null);
      expect(getCollectorHostUrl()).toBeNull();
    });
  });

  describe("initMetaplow", () => {
    describe("getUserId", () => {
      it("injects the user_id into the event data", async () => {
        await setup({ userId: 123 });

        await trackMetaplowEvent("button_clicked");

        const { payload } = getSentPayload();
        expect(payload.data.user_id).toBe(123);
      });
    });

    it("posts to the host URL it is given rather than to the configured collector", async () => {
      await setup({ hostUrl: RELAY_HOST_URL });

      await trackMetaplowEvent("button_clicked");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][0]).toBe(`${RELAY_HOST_URL}/send`);
    });

    it("does not initialize without a host URL", async () => {
      await setup({ hostUrl: null });

      await trackMetaplowEvent("button_clicked");

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("trackMetaplowEvent", () => {
    it("does not call fetch when metaplow-url is not set", async () => {
      Settings.set("metaplow-url", null);
      await setup();
      await trackMetaplowEvent("button_clicked");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("sends an event with the given name and default empty data", async () => {
      await setup();
      await trackMetaplowEvent("button_clicked");

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

    it("forwards the data payload", async () => {
      await setup();
      await trackMetaplowEvent("button_clicked", { foo: "bar", count: 3 });

      const { payload } = getSentPayload();
      expect(payload.data).toEqual({ foo: "bar", count: 3 });
    });

    it("includes screen and language from the browser", async () => {
      await setup();
      await trackMetaplowEvent("button_clicked");

      const { payload } = getSentPayload();
      expect(payload.screen).toBe(
        `${window.screen.width}x${window.screen.height}`,
      );
      expect(payload.language).toBe(navigator.language);
    });

    it("uses an anonymized hostname in the url", async () => {
      await setup();
      await trackMetaplowEvent("button_clicked");

      const { payload } = getSentPayload();
      expect(payload.url.startsWith(ANON_ORIGIN)).toBe(true);
    });
  });

  describe("trackMetaplowPageView", () => {
    it("does not call fetch when metaplow-url is not set", async () => {
      Settings.set("metaplow-url", null);
      await setup();
      await trackMetaplowPageView("/question/42-my-question");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('sends an event with name "pageview"', async () => {
      await setup();
      await trackMetaplowPageView("/dashboard/1");

      const { payload } = getSentPayload();
      expect(payload.name).toBe("pageview");
      expect(payload.url).toBe(`${ANON_ORIGIN}/dashboard/1`);
    });

    it("strips slugs from /:id-slug paths", async () => {
      await setup();
      await trackMetaplowPageView("/question/42-my-favorite-question");

      const { payload } = getSentPayload();
      expect(payload.url).toBe(`${ANON_ORIGIN}/question/42`);
    });

    it("anonymizes absolute URLs by replacing the origin", async () => {
      await setup();
      await trackMetaplowPageView(
        "https://my-company.metabaseapp.com/collection/5-secrets",
      );

      const { payload } = getSentPayload();
      expect(payload.url).toBe(`${ANON_ORIGIN}/collection/5`);
    });

    it("preserves paths without a numeric slug prefix", async () => {
      await setup();
      await trackMetaplowPageView("/admin/settings/general");

      const { payload } = getSentPayload();
      expect(payload.url).toBe(`${ANON_ORIGIN}/admin/settings/general`);
    });
  });
});
