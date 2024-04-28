import cx from "classnames";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";

interface AttributeOptionsEmptyStateProps {
  title: string;
}

export const AttributeOptionsEmptyState = ({
  title,
}: AttributeOptionsEmptyStateProps) => (
  <div
    className={cx(
      CS.flex,
      CS.alignCenter,
      CS.rounded,
      "bg-slate-extra-light",
      CS.p2,
    )}
  >
    <img
      src="app/assets/img/attributes_illustration.png"
      srcSet="
        app/assets/img/attributes_illustration.png    1x,
        app/assets/img/attributes_illustration@2x.png 2x,
      "
      className={CS.mr2}
    />
    <div>
      <h3 className={CS.pb1}>{title}</h3>
      <div>{t`You can add attributes automatically by setting up an SSO that uses SAML, or you can enter them manually by going to the People section and clicking on the … menu on the far right.`}</div>
    </div>
  </div>
);
