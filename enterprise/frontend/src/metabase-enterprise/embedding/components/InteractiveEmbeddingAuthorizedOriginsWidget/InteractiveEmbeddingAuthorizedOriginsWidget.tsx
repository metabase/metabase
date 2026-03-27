import cx from "classnames";
import { jt, t } from "ttag";

import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import CS from "metabase/css/core/index.css";

const Description = () => {
  return jt`Enter the origins for the websites or web apps where you want to allow embedding, separated by a space. Here are the ${(
    <ExternalLink
      key="specs"
      href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-ancestors"
      className={cx(CS.textBold, CS.link)}
    >
      {t`exact specifications`}
    </ExternalLink>
  )} for what can be entered.`;
};

export const InteractiveEmbeddingAuthorizedOriginsWidget = () => (
  <AdminSettingInput
    name="embedding-app-origins-interactive"
    title={t`Authorized origins`}
    description={<Description />}
    placeholder="https://*.example.com"
    inputType="text"
  />
);
