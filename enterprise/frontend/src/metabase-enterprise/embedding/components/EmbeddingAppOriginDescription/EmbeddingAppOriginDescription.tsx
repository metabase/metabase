import { jt, t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";

export const EmbeddingAppOriginDescription = () => {
  return jt`Enter the origins for the websites or web apps where you want to allow embedding, separated by a space. Here are the ${(
    <ExternalLink
      key="specs"
      href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-ancestors"
    >
      {t`exact specifications`}
    </ExternalLink>
  )} for what can be entered.`;
};
