import { t } from "ttag";

import type { ButtonProps } from "metabase/core/components/Button";
import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import * as Urls from "metabase/lib/urls";
import type {
  Card,
  CollectionItem,
  RecentCollectionItem,
} from "metabase-types/api";

type ModelCard = Card & { type: "model" };

/**
 * Omitting the "type" attribute is hopefully a temporary workaround
 * until Metrics v2 are supported in Collections and the ambiguity between
 * CollectionItem["type"] and Card["type"] disappears.
 *
 * @see https://github.com/metabase/metabase/issues/37350#issuecomment-1910284020
 */
type ModelCollectionItem = Omit<
  CollectionItem,
  "type" | "based_on_upload" | "collection_id"
>;

interface Props extends ButtonProps {
  model: ModelCard | ModelCollectionItem | RecentCollectionItem;
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
      iconSize={16}
      role="link"
      data-testid="model-detail-link"
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModelDetailLink;
