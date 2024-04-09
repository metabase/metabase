import { t } from "ttag";

import NewItemMenu from "metabase/containers/NewItemMenu";
import Button from "metabase/core/components/Button";
import { Text } from "metabase/ui";
import type { Collection } from "metabase-types/api";

import {
  EmptyStateIconBackground,
  EmptyStateIconForeground,
  EmptyStateRoot,
  EmptyStateTitle,
} from "./CollectionEmptyState.styled";

export interface CollectionEmptyStateProps {
  collection?: Collection;
}

const CollectionEmptyState = ({
  collection,
}: CollectionEmptyStateProps): JSX.Element => {
  const canWrite = !!collection?.can_write;

  return (
    <EmptyStateRoot data-testid="collection-empty-state">
      <CollectionEmptyIcon />
      <EmptyStateTitle>{t`This collection is empty`}</EmptyStateTitle>
      <Text size="1rem" color="text-medium" align="center" mb="1.5rem">
        {t`Use collections to organize and group dashboards and questions for your team or yourself`}
      </Text>
      {canWrite && (
        <NewItemMenu
          trigger={<Button icon="add">{t`Create a new…`}</Button>}
          collectionId={collection?.id}
        />
      )}
    </EmptyStateRoot>
  );
};

const CollectionEmptyIcon = (): JSX.Element => {
  return (
    <svg width="117" height="94" fill="none" xmlns="http://www.w3.org/2000/svg">
      <EmptyStateIconForeground
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12.5 1C6.148 1 .995 6.151 1 12.505l.023 69C1.029 87.854 6.175 93 12.523 93H104.5C110.853 93 116 87.851 116 81.5V22.196c0-6.352-5.147-11.5-11.501-11.5H65.357a5.752 5.752 0 0 1-5.307-3.533l-1.099-2.63A5.752 5.752 0 0 0 53.644 1H12.5Z"
        strokeWidth="2"
      />
      <EmptyStateIconBackground
        d="M1 13C1 6.373 6.373 1 13 1h39.76a8 8 0 0 1 7.017 4.157l.446.815a8 8 0 0 0 7.017 4.158H107a9 9 0 0 1 9 9V26l-2.714-3.137a16.003 16.003 0 0 0-12.099-5.53H15.383a16 16 0 0 0-13.155 6.893L1 26V13Z"
        strokeWidth="2"
      />
    </svg>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionEmptyState;
