import React from "react";

import Link from "metabase/components/Link";
import Icon from "metabase/components/Icon";

type Props = {
  to: string,
};

const OpenInMetabase = ({ ...props }: Props) => (
  <Link {...props} className="link flex align-center" target="_blank">
    <Icon name="external" className="mr1" />
    Open in Metabase
  </Link>
);

export default OpenInMetabase;
