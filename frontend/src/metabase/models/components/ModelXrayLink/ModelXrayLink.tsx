import React from "react";
import { t } from "ttag";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import Button from "metabase/core/components/Button/Button";
import Link from "metabase/core/components/Link/Link";
import { CardId } from "metabase-types/api";

interface ModelXrayLinkProps {
  id: CardId;
}

const ModelXrayLink = ({ id }: ModelXrayLinkProps): JSX.Element => {
  return (
    <Button
      as={Link}
      to={Urls.xrayQuestion(id)}
      icon="bolt"
      iconColor={color("accent4")}
      onlyIcon
      role="link"
      tooltip={t`X-ray this model`}
      aria-label={t`X-ray this model`}
      data-testid="model-xray-link"
    />
  );
};

export default ModelXrayLink;
