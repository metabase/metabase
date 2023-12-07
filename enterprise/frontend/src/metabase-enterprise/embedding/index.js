import { t } from "ttag";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import {
  PLUGIN_ADMIN_SETTINGS_UPDATES,
  PLUGIN_EMBEDDING,
} from "metabase/plugins";
import { EmbeddingAppOriginDescription } from "./components/EmbeddingAppOriginDescription";
import {
  EmbeddingAppSameSiteCookieDescription,
  SameSiteSelectWidget,
} from "./components/EmbeddingAppSameSiteCookieDescription";

const SLUG = "embedding-in-other-applications/full-app";

if (hasPremiumFeature("embedding")) {
  PLUGIN_EMBEDDING.isEnabled = () => true;

  PLUGIN_ADMIN_SETTINGS_UPDATES.push(sections => {
    return {
      ...sections,
      [SLUG]: {
        ...sections[SLUG],
        settings: [
          ...sections[SLUG]["settings"],
          {
            key: "embedding-app-origin",
            display_name: t`Embedding the entire Metabase app`,
            description: <EmbeddingAppOriginDescription />,
            placeholder: "https://*.example.com",
            type: "string",
            getHidden: (_, derivedSettings) =>
              !derivedSettings["enable-embedding"],
          },
          {
            key: "session-cookie-samesite",
            description: <EmbeddingAppSameSiteCookieDescription />,
            type: "select",
            options: [
              {
                value: "lax",
                name: t`Lax (default)`,
                description: t`Allows cookies to be sent when a user is navigating to the origin site from an external site (like when following a link).`,
              },
              {
                value: "strict",
                name: t`Strict (not recommended)`,
                description: t`Never allows cookies to be sent on a cross-site request. Warning: this will prevent users from following external links to Metabase.`,
              },
              {
                value: "none",
                name: t`None`,
                description: t`Allows all cross-site requests. Incompatible with most Safari and iOS-based browsers.`,
              },
            ],
            defaultValue: "lax",
            widget: SameSiteSelectWidget,
            getHidden: (_, derivedSettings) =>
              !derivedSettings["enable-embedding"],
          },
        ],
      },
    };
  });
}
