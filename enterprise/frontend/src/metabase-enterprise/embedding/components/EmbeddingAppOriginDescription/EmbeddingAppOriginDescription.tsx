import { jt, t } from "ttag";
import ExternalLink from "metabase/core/components/ExternalLink";
import MetabaseSettings from "metabase/lib/settings";

export const EmbeddingAppOriginDescription = () => {
  return (
    <div>
      {jt`With this Pro/Enterprise feature you can embed the full Metabase app. Enable your users to drill-through to charts, browse collections, and use the graphical query builder. ${(
        <ExternalLink
          key="learn-more"
          href={MetabaseSettings.learnUrl(
            "embedding/multi-tenant-self-service-analytics",
          )}
        >
          {t`Learn more.`}
        </ExternalLink>
      )}`}
      <div className="my4">
        <strong className="block text-dark mb1">{t`Authorized origins`}</strong>
        {jt`Enter the origins for the websites or web apps where you want to allow embedding, separated by a space. Here are the ${(
          <ExternalLink
            key="specs"
            href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-ancestors"
          >
            {t`exact specifications`}
          </ExternalLink>
        )} for what can be entered.`}
      </div>
    </div>
  );
};
