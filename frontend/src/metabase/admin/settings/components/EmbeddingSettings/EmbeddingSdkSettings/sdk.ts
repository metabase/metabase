import { useDocsUrl } from "metabase/common/hooks";
import { getPlan } from "metabase/common/utils/plan";
import { useSelector } from "metabase/lib/redux";
import {
  getLearnUrl,
  getSetting,
  getUpgradeUrl,
} from "metabase/selectors/settings";

export const useEmbeddingSettingsLinks = () => {
  const plan = useSelector(state =>
    getPlan(getSetting(state, "token-features")),
  );
  const addUtmToLink = (url: string) =>
    `${url}?${new URLSearchParams({
      utm_source: "product",
      utm_medium: "docs",
      utm_campaign: "embedding-sdk",
      utm_content: "embedding-sdk-admin",
      source_plan: plan,
    })}`;

  const quickStartUrl = addUtmToLink("https://metaba.se/sdk-quick-start");
  const documentationUrl = addUtmToLink("https://metaba.se/sdk-docs");
  const implementJwtUrl = addUtmToLink(
    getLearnUrl("metabase-basics/embedding/securing-embeds"),
  );

  const { url: activationUrl } = useDocsUrl(
    "paid-features/activating-the-enterprise-edition",
  );
  const switchMetabaseBinariesUrl = addUtmToLink(activationUrl);

  const upgradeUrl = useSelector(state =>
    getUpgradeUrl(state, {
      utm_campaign: "embedding-sdk",
      utm_content: "embedding-sdk-admin",
    }),
  );

  return {
    quickStartUrl,
    switchMetabaseBinariesUrl,
    implementJwtUrl,
    documentationUrl,
    upgradeUrl,
  };
};
