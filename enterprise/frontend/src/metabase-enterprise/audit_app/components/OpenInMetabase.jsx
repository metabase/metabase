import { t } from "ttag";

import { Icon } from "metabase/core/components/Icon";
import Link from "metabase/core/components/Link";

const OpenInMetabase = ({ ...props }) => (
  <Link {...props} className="link flex align-center" target="_blank">
    <Icon name="external" className="mr1" />
    {t`Open in Metabase`}
  </Link>
);

export default OpenInMetabase;
