// Ensure the custom elements are registered
import "metabase/embedding/embedding-iframe-sdk/embed";
import type { MetabaseEmbedElement } from "metabase/embedding/embedding-iframe-sdk/embed";

import { createEmbeddedAnalyticsJsUsage } from "./analytics";
import type { SdkIframeEmbedBaseSettings } from "./types/embed";

const defineMetabaseConfig = (config: SdkIframeEmbedBaseSettings) => {
  (window as any).metabaseConfig = config;
};

describe("createEmbeddedAnalyticsJsUsage", () => {
  beforeEach(() => {
    // clean up window.metabaseConfig
    delete (window as any).metabaseConfig;
  });

  describe("Metabase configuration", () => {
    it('should capture "session" auth method', () => {
      defineMetabaseConfig({
        useExistingUserSession: true,
        instanceUrl: "https://example.com",
      });

      expect(
        createEmbeddedAnalyticsJsUsage(
          new Set([createEmbeddedAnalyticsJsElement("metabase-question")]),
        ),
      ).toEqual(
        expect.objectContaining({
          global: expect.objectContaining({
            auth_method: "session",
          }),
        }),
      );
    });

    it('should capture "api_key" auth method', () => {
      defineMetabaseConfig({
        useExistingUserSession: false,
        apiKey: "blabla",
        instanceUrl: "https://example.com",
      });

      expect(
        createEmbeddedAnalyticsJsUsage(
          new Set([createEmbeddedAnalyticsJsElement("metabase-question")]),
        ),
      ).toEqual(
        expect.objectContaining({
          global: expect.objectContaining({
            auth_method: "api_key",
          }),
        }),
      );
    });

    it('should capture "sso" auth method', () => {
      defineMetabaseConfig({
        instanceUrl: "https://example.com",
      });

      expect(
        createEmbeddedAnalyticsJsUsage(
          new Set([createEmbeddedAnalyticsJsElement("metabase-question")]),
        ),
      ).toEqual(
        expect.objectContaining({
          global: expect.objectContaining({
            auth_method: "sso",
          }),
        }),
      );
    });

    it('should capture "guest" auth method', () => {
      defineMetabaseConfig({
        isGuest: true,
        instanceUrl: "https://example.com",
      });

      expect(
        createEmbeddedAnalyticsJsUsage(
          new Set([createEmbeddedAnalyticsJsElement("metabase-question")]),
        ),
      ).toEqual(
        expect.objectContaining({
          global: expect.objectContaining({
            auth_method: "guest",
          }),
        }),
      );
    });

    it("should track locale_used when locale is set", () => {
      defineMetabaseConfig({
        instanceUrl: "https://example.com",
        locale: "de",
      });

      const usage = createEmbeddedAnalyticsJsUsage(
        new Set([createEmbeddedAnalyticsJsElement("metabase-dashboard")]),
      );

      expect(usage.global.locale_used).toBe(true);
    });

    it("should track locale_used as false when locale is not set", () => {
      defineMetabaseConfig({
        instanceUrl: "https://example.com",
      });

      const usage = createEmbeddedAnalyticsJsUsage(
        new Set([createEmbeddedAnalyticsJsElement("metabase-dashboard")]),
      );

      expect(usage.global.locale_used).toBe(false);
    });
  });

  describe("Component usage", () => {
    describe("dashboard", () => {
      it("should count default values", () => {
        const usage = createEmbeddedAnalyticsJsUsage(
          new Set([createEmbeddedAnalyticsJsElement("metabase-dashboard")]),
        );

        expect(usage.components).toContainEqual({
          name: "dashboard",
          properties: expect.arrayContaining([
            {
              name: "drills",
              values: [{ group: "true", value: 1 }],
            },
            {
              name: "with_downloads",
              values: [{ group: "false", value: 1 }],
            },
            {
              name: "with_title",
              values: [{ group: "true", value: 1 }],
            },
            {
              name: "with_subscriptions",
              values: [{ group: "false", value: 1 }],
            },
            {
              name: "auto_refresh_interval",
              values: [{ group: "false", value: 1 }],
            },
            {
              name: "enable_entity_navigation",
              values: [{ group: "false", value: 1 }],
            },
          ]),
        });
      });

      it("should count properties correctly", () => {
        // Explicit default values
        const usage1 = createEmbeddedAnalyticsJsUsage(
          new Set([
            createEmbeddedAnalyticsJsElement("metabase-dashboard", {
              drills: true,
              "with-downloads": false,
              "with-title": true,
              "with-subscriptions": false,
            }),
          ]),
        );

        expect(usage1.components).toContainEqual({
          name: "dashboard",
          properties: expect.arrayContaining([
            {
              name: "drills",
              values: [{ group: "true", value: 1 }],
            },
            {
              name: "with_downloads",
              values: [{ group: "false", value: 1 }],
            },
            {
              name: "with_title",
              values: [{ group: "true", value: 1 }],
            },
            {
              name: "with_subscriptions",
              values: [{ group: "false", value: 1 }],
            },
          ]),
        });

        // Flip the default values
        const usage2 = createEmbeddedAnalyticsJsUsage(
          new Set([
            createEmbeddedAnalyticsJsElement("metabase-dashboard", {
              drills: false,
              "with-downloads": true,
              "with-title": false,
              "with-subscriptions": true,
            }),
          ]),
        );

        expect(usage2.components).toContainEqual({
          name: "dashboard",
          properties: expect.arrayContaining([
            {
              name: "drills",
              values: [{ group: "false", value: 1 }],
            },
            {
              name: "with_downloads",
              values: [{ group: "true", value: 1 }],
            },
            {
              name: "with_title",
              values: [{ group: "false", value: 1 }],
            },
            {
              name: "with_subscriptions",
              values: [{ group: "true", value: 1 }],
            },
          ]),
        });

        // Multiple components
        const usage3 = createEmbeddedAnalyticsJsUsage(
          new Set([
            createEmbeddedAnalyticsJsElement("metabase-dashboard"),
            createEmbeddedAnalyticsJsElement("metabase-dashboard"),
            createEmbeddedAnalyticsJsElement("metabase-dashboard", {
              drills: false,
              "with-downloads": true,
              "with-title": false,
              "with-subscriptions": true,
            }),
          ]),
        );

        expect(usage3.components).toContainEqual({
          name: "dashboard",
          properties: expect.arrayContaining([
            {
              name: "drills",
              values: expect.arrayContaining([
                { group: "true", value: 2 },
                { group: "false", value: 1 },
              ]),
            },
            {
              name: "with_downloads",
              values: expect.arrayContaining([
                { group: "true", value: 1 },
                { group: "false", value: 2 },
              ]),
            },
            {
              name: "with_title",
              values: expect.arrayContaining([
                { group: "true", value: 2 },
                { group: "false", value: 1 },
              ]),
            },
            {
              name: "with_subscriptions",
              values: expect.arrayContaining([
                { group: "true", value: 1 },
                { group: "false", value: 2 },
              ]),
            },
          ]),
        });
      });

      it("should track auto_refresh_interval property", () => {
        const usage = createEmbeddedAnalyticsJsUsage(
          new Set([
            createEmbeddedAnalyticsJsElement("metabase-dashboard", {
              "auto-refresh-interval": 60,
            }),
            createEmbeddedAnalyticsJsElement("metabase-dashboard"),
          ]),
        );

        const dashboardComponent = usage.components.find(
          (c) => c.name === "dashboard",
        );
        const autoRefreshProp = dashboardComponent?.properties.find(
          (p) => p.name === "auto_refresh_interval",
        );

        expect(autoRefreshProp?.values).toEqual(
          expect.arrayContaining([
            { group: "true", value: 1 },
            { group: "false", value: 1 },
          ]),
        );
      });

      it("should track enable_entity_navigation property", () => {
        const usage = createEmbeddedAnalyticsJsUsage(
          new Set([
            createEmbeddedAnalyticsJsElement("metabase-dashboard", {
              "enable-entity-navigation": true,
            }),
            createEmbeddedAnalyticsJsElement("metabase-dashboard", {
              "enable-entity-navigation": false,
            }),
            createEmbeddedAnalyticsJsElement("metabase-dashboard"),
          ]),
        );

        const dashboardComponent = usage.components.find(
          (c) => c.name === "dashboard",
        );
        const entityNavProp = dashboardComponent?.properties.find(
          (p) => p.name === "enable_entity_navigation",
        );

        expect(entityNavProp?.values).toEqual(
          expect.arrayContaining([
            { group: "true", value: 1 },
            { group: "false", value: 2 },
          ]),
        );
      });
    });

    describe("question", () => {
      it("should count default values", () => {
        const usage = createEmbeddedAnalyticsJsUsage(
          new Set([
            createEmbeddedAnalyticsJsElement("metabase-question", {
              "question-id": 1,
            }),
          ]),
        );

        expect(usage.components).toContainEqual({
          name: "question",
          properties: expect.arrayContaining([
            {
              name: "drills",
              values: [{ group: "true", value: 1 }],
            },
            {
              name: "with_downloads",
              values: [{ group: "false", value: 1 }],
            },
            {
              name: "with_title",
              values: [{ group: "true", value: 1 }],
            },
            {
              name: "is_save_enabled",
              values: [{ group: "false", value: 1 }],
            },
            {
              name: "with_alerts",
              values: [{ group: "false", value: 1 }],
            },
            {
              name: "id_new_native",
              values: [{ group: "false", value: 1 }],
            },
            {
              name: "id_new",
              values: [{ group: "false", value: 1 }],
            },
          ]),
        });
      });

      it("should count properties correctly", () => {
        // Explicit default values
        const usage1 = createEmbeddedAnalyticsJsUsage(
          new Set([
            createEmbeddedAnalyticsJsElement("metabase-question", {
              "question-id": 1,
              drills: true,
              "with-downloads": false,
              "with-title": true,
              "is-save-enabled": false,
              "with-alerts": false,
            }),
          ]),
        );

        expect(usage1.components).toContainEqual({
          name: "question",
          properties: expect.arrayContaining([
            {
              name: "drills",
              values: [{ group: "true", value: 1 }],
            },
            {
              name: "with_downloads",
              values: [{ group: "false", value: 1 }],
            },
            {
              name: "with_title",
              values: [{ group: "true", value: 1 }],
            },
            {
              name: "is_save_enabled",
              values: [{ group: "false", value: 1 }],
            },
            {
              name: "with_alerts",
              values: [{ group: "false", value: 1 }],
            },
          ]),
        });

        // Flip the default values
        const usage2 = createEmbeddedAnalyticsJsUsage(
          new Set([
            createEmbeddedAnalyticsJsElement("metabase-question", {
              "question-id": 1,
              drills: false,
              "with-downloads": true,
              "with-title": false,
              "is-save-enabled": true,
              "with-alerts": true,
            }),
          ]),
        );

        expect(usage2.components).toContainEqual({
          name: "question",
          properties: expect.arrayContaining([
            {
              name: "drills",
              values: [{ group: "false", value: 1 }],
            },
            {
              name: "with_downloads",
              values: [{ group: "true", value: 1 }],
            },
            {
              name: "with_title",
              values: [{ group: "false", value: 1 }],
            },
            {
              name: "is_save_enabled",
              values: [{ group: "true", value: 1 }],
            },
            {
              name: "with_alerts",
              values: [{ group: "true", value: 1 }],
            },
          ]),
        });

        // Multiple components
        const usage3 = createEmbeddedAnalyticsJsUsage(
          new Set([
            createEmbeddedAnalyticsJsElement("metabase-question"),
            createEmbeddedAnalyticsJsElement("metabase-question"),
            createEmbeddedAnalyticsJsElement("metabase-question", {
              drills: false,
              "with-downloads": true,
              "with-title": false,
              "is-save-enabled": true,
              "with-alerts": true,
            }),
          ]),
        );

        expect(usage3.components).toContainEqual({
          name: "question",
          properties: expect.arrayContaining([
            {
              name: "drills",
              values: expect.arrayContaining([
                { group: "true", value: 2 },
                { group: "false", value: 1 },
              ]),
            },
            {
              name: "with_downloads",
              values: expect.arrayContaining([
                { group: "true", value: 1 },
                { group: "false", value: 2 },
              ]),
            },
            {
              name: "with_title",
              values: expect.arrayContaining([
                { group: "true", value: 2 },
                { group: "false", value: 1 },
              ]),
            },
            {
              name: "is_save_enabled",
              values: expect.arrayContaining([
                { group: "true", value: 1 },
                { group: "false", value: 2 },
              ]),
            },
            {
              name: "with_alerts",
              values: expect.arrayContaining([
                { group: "true", value: 1 },
                { group: "false", value: 2 },
              ]),
            },
          ]),
        });
      });

      it("should track id_new_native and id_new properties", () => {
        const usage = createEmbeddedAnalyticsJsUsage(
          new Set([
            createEmbeddedAnalyticsJsElement("metabase-question", {
              "question-id": "new-native",
            }),
            createEmbeddedAnalyticsJsElement("metabase-question", {
              "question-id": "new",
            }),
            createEmbeddedAnalyticsJsElement("metabase-question", {
              "question-id": 123,
            }),
          ]),
        );

        const questionComponent = usage.components.find(
          (c) => c.name === "question",
        );
        const idNewNativeProp = questionComponent?.properties.find(
          (p) => p.name === "id_new_native",
        );
        const idNewProp = questionComponent?.properties.find(
          (p) => p.name === "id_new",
        );

        expect(idNewNativeProp?.values).toEqual([{ group: "false", value: 1 }]);
        expect(idNewProp?.values).toEqual([{ group: "false", value: 1 }]);
      });
    });

    describe("question with exploration", () => {
      it("should count default values", () => {
        const usage = createEmbeddedAnalyticsJsUsage(
          new Set([
            createEmbeddedAnalyticsJsElement("metabase-question", {
              "question-id": "new",
            }),
          ]),
        );

        expect(usage.components).toContainEqual({
          name: "exploration",
          properties: [
            {
              name: "is_save_enabled",
              values: [{ group: "false", value: 1 }],
            },
          ],
        });
      });

      it("should count question components with exploration", () => {
        // Explicit default values
        const usage1 = createEmbeddedAnalyticsJsUsage(
          new Set([
            createEmbeddedAnalyticsJsElement("metabase-question", {
              "question-id": "new",
              "is-save-enabled": false,
            }),
          ]),
        );

        expect(usage1.components).toContainEqual({
          name: "exploration",
          properties: [
            {
              name: "is_save_enabled",
              values: [{ group: "false", value: 1 }],
            },
          ],
        });

        // Flip the default values
        const usage2 = createEmbeddedAnalyticsJsUsage(
          new Set([
            createEmbeddedAnalyticsJsElement("metabase-question", {
              "question-id": "new",
              "is-save-enabled": true,
            }),
          ]),
        );

        expect(usage2.components).toContainEqual({
          name: "exploration",
          properties: [
            {
              name: "is_save_enabled",
              values: [{ group: "true", value: 1 }],
            },
          ],
        });

        // Multiple components
        const usage3 = createEmbeddedAnalyticsJsUsage(
          new Set([
            createEmbeddedAnalyticsJsElement("metabase-question", {
              "question-id": "new",
            }),
            createEmbeddedAnalyticsJsElement("metabase-question", {
              "question-id": "new",
            }),
            createEmbeddedAnalyticsJsElement("metabase-question", {
              "question-id": "new",
              "is-save-enabled": true,
            }),
          ]),
        );

        expect(usage3.components).toContainEqual({
          name: "exploration",
          properties: [
            {
              name: "is_save_enabled",
              values: expect.arrayContaining([
                { group: "true", value: 1 },
                { group: "false", value: 2 },
              ]),
            },
          ],
        });
      });

      it("should track exploration with new-native questionId", () => {
        const usage = createEmbeddedAnalyticsJsUsage(
          new Set([
            createEmbeddedAnalyticsJsElement("metabase-question", {
              "question-id": "new-native",
            }),
          ]),
        );

        expect(usage.components).toContainEqual({
          name: "exploration",
          properties: [
            {
              name: "is_save_enabled",
              values: [{ group: "false", value: 1 }],
            },
          ],
        });
      });
    });

    describe("browser", () => {
      it("should count default values", () => {
        const usage = createEmbeddedAnalyticsJsUsage(
          new Set([createEmbeddedAnalyticsJsElement("metabase-browser")]),
        );

        expect(usage.components).toContainEqual({
          name: "browser",
          properties: expect.arrayContaining([
            {
              name: "read_only",
              values: [{ group: "true", value: 1 }],
            },
            {
              name: "enable_entity_navigation",
              values: [{ group: "false", value: 1 }],
            },
          ]),
        });
      });

      it("should count properties correctly", () => {
        // Explicit default values
        const usage1 = createEmbeddedAnalyticsJsUsage(
          new Set([
            createEmbeddedAnalyticsJsElement("metabase-browser", {
              "read-only": true,
            }),
          ]),
        );

        expect(usage1.components).toContainEqual({
          name: "browser",
          properties: expect.arrayContaining([
            {
              name: "read_only",
              values: [{ group: "true", value: 1 }],
            },
          ]),
        });

        // Flip the default values
        const usage2 = createEmbeddedAnalyticsJsUsage(
          new Set([
            createEmbeddedAnalyticsJsElement("metabase-browser", {
              "read-only": false,
            }),
          ]),
        );

        expect(usage2.components).toContainEqual({
          name: "browser",
          properties: expect.arrayContaining([
            {
              name: "read_only",
              values: [{ group: "false", value: 1 }],
            },
          ]),
        });

        // Multiple components
        const usage3 = createEmbeddedAnalyticsJsUsage(
          new Set([
            createEmbeddedAnalyticsJsElement("metabase-browser"),
            createEmbeddedAnalyticsJsElement("metabase-browser"),
            createEmbeddedAnalyticsJsElement("metabase-browser", {
              "read-only": false,
            }),
          ]),
        );

        expect(usage3.components).toContainEqual({
          name: "browser",
          properties: expect.arrayContaining([
            {
              name: "read_only",
              values: expect.arrayContaining([
                { group: "true", value: 2 },
                { group: "false", value: 1 },
              ]),
            },
          ]),
        });
      });

      it("should track enable_entity_navigation property", () => {
        const usage = createEmbeddedAnalyticsJsUsage(
          new Set([
            createEmbeddedAnalyticsJsElement("metabase-browser", {
              "enable-entity-navigation": true,
            }),
            createEmbeddedAnalyticsJsElement("metabase-browser", {
              "enable-entity-navigation": false,
            }),
            createEmbeddedAnalyticsJsElement("metabase-browser"),
          ]),
        );

        const browserComponent = usage.components.find(
          (c) => c.name === "browser",
        );
        const entityNavProp = browserComponent?.properties.find(
          (p) => p.name === "enable_entity_navigation",
        );

        expect(entityNavProp?.values).toEqual(
          expect.arrayContaining([
            { group: "true", value: 1 },
            { group: "false", value: 2 },
          ]),
        );
      });
    });

    describe("metabot", () => {
      it("should track metabot component with layout property", () => {
        const usage = createEmbeddedAnalyticsJsUsage(
          new Set([
            createEmbeddedAnalyticsJsElement("metabase-metabot", {
              layout: "auto",
            }),
            createEmbeddedAnalyticsJsElement("metabase-metabot", {
              layout: "sidebar",
            }),
            createEmbeddedAnalyticsJsElement("metabase-metabot", {
              layout: "stacked",
            }),
            createEmbeddedAnalyticsJsElement("metabase-metabot"),
          ]),
        );

        expect(usage.components).toContainEqual({
          name: "metabot",
          properties: [
            {
              name: "layout",
              values: expect.arrayContaining([
                { group: "auto", value: 2 },
                { group: "sidebar", value: 1 },
                { group: "stacked", value: 1 },
              ]),
            },
          ],
        });
      });
    });
  });

  describe("Guest embed defaults", () => {
    it("should use different default for drills in guest dashboard embeds", () => {
      defineMetabaseConfig({
        isGuest: true,
        instanceUrl: "https://example.com",
      });

      const usage = createEmbeddedAnalyticsJsUsage(
        new Set([
          createEmbeddedAnalyticsJsElement("metabase-dashboard"),
          createEmbeddedAnalyticsJsElement("metabase-dashboard", {
            drills: true,
          }),
        ]),
      );

      const dashboardComponent = usage.components.find(
        (c) => c.name === "dashboard",
      );
      const drillsProp = dashboardComponent?.properties.find(
        (p) => p.name === "drills",
      );

      expect(drillsProp?.values).toEqual(
        expect.arrayContaining([
          { group: "false", value: 1 }, // Guest default
          { group: "true", value: 1 }, // Explicit true
        ]),
      );
    });

    it("should use different default for drills in guest question embeds", () => {
      defineMetabaseConfig({
        isGuest: true,
        instanceUrl: "https://example.com",
      });

      const usage = createEmbeddedAnalyticsJsUsage(
        new Set([
          createEmbeddedAnalyticsJsElement("metabase-question", {
            "question-id": 1,
          }),
          createEmbeddedAnalyticsJsElement("metabase-question", {
            "question-id": 2,
            drills: true,
          }),
        ]),
      );

      const questionComponent = usage.components.find(
        (c) => c.name === "question",
      );
      const drillsProp = questionComponent?.properties.find(
        (p) => p.name === "drills",
      );

      expect(drillsProp?.values).toEqual(
        expect.arrayContaining([
          { group: "false", value: 1 }, // Guest default
          { group: "true", value: 1 }, // Explicit true
        ]),
      );
    });
  });
});

type Component =
  | "metabase-dashboard"
  | "metabase-question"
  | "metabase-browser"
  | "metabase-metabot";
function createEmbeddedAnalyticsJsElement(
  componentName: Component,
  properties: Record<string, any> = {},
): MetabaseEmbedElement {
  const component = document.createElement(
    componentName,
  ) as MetabaseEmbedElement;
  Object.entries(properties).forEach(([key, value]) => {
    component.setAttribute(key, value);
  });

  return component;
}
