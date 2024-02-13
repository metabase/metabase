import { t } from "ttag";

import Link from "metabase/core/components/Link";
import { Icon } from "metabase/ui";

const OpenInMetabase = ({ ...props }) => (
  <Link {...props} className="link flex align-center" target="_blank">
    <Icon name="external" className="mr1" />
    {t`Open in Metabase`}
  </Link>
);

export default OpenInMetabase;
