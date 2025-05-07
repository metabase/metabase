import { t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import { getUpgradeUrl } from "metabase/selectors/settings";
import { Icon } from "metabase/ui";

import S from "./NudgeToPro.module.css";

export const NudgeToPro = () => {
  const upgradeUrl = useSelector((state) =>
    getUpgradeUrl(state, { utm_content: "people" }),
  );

  return (
    <div className={S.nudgeCard}>
      <Icon name="group" size={40} color={color("brand")} />
      <div className={S.description}>
        {t`Tired of manually managing people and groups?`}
      </div>
      <div className={S.subtitle}>
        {t`Get single-sign on (SSO) via SAML, JWT, or LDAP with Metabase Pro`}
      </div>
      <ExternalLink href={upgradeUrl} className={S.proLink}>
        {t`Learn more`}
      </ExternalLink>
    </div>
  );
};
