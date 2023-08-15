import { t } from "ttag";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import {
  PLUGIN_ADMIN_SETTINGS_UPDATES,
  PLUGIN_EMBEDDING,
} from "metabase/plugins";
import { EmbeddingAppOriginDescription } from "./components/EmbeddingAppOriginDescription";

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
        ],
      },
    };
  });
}
