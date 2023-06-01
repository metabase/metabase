import { t } from "ttag";

import Button, { ButtonProps } from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";

import * as Urls from "metabase/lib/urls";

import type { Card, CollectionItem } from "metabase-types/api";

type ModelCard = Card & { dataset: true };

interface Props extends ButtonProps {
  model: ModelCard | CollectionItem;
}

function ModelDetailLink({ model, ...props }: Props) {
  return (
    <Button
      aria-label={t`Model details`}
      tooltip={t`Model details`}
      {...props}
      as={Link}
      to={Urls.modelDetail(model)}
      icon="reference"
      onlyIcon
      role="link"
      data-testid="model-detail-link"
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModelDetailLink;
