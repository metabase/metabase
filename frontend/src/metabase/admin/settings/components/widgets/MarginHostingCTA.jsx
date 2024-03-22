/* eslint-disable react/prop-types */
import { t } from "ttag";

import HostingInfoLink from "metabase/admin/settings/components/widgets/HostingInfoLink";
import Text from "metabase/components/type/Text";
import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";

const MarginHostingCTA = ({ tagline }) => (
  <div
    className="border-left border-brand text-brand px4"
    style={{ height: 172 }}
  >
    <Icon name="cloud" size={48} style={{ color: "#B9D8F4" }} />
    <div className={CS.pb3}>
      <Text className="text-brand mb0">{tagline}</Text>
      <Text className="text-brand text-bold">{t`Migrate to Metabase Cloud.`}</Text>
    </div>

    <HostingInfoLink text={t`Learn more`} />
  </div>
);

export default MarginHostingCTA;
