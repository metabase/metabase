import { t } from "ttag";

import {
  useGetCollectionItemsMetadataQuery,
  useListCollectionItemsQuery,
} from "metabase/api";
import {
  type CollectionTypeFilterModel,
  TYPE_FILTER_MODELS,
} from "metabase/collections/components/CollectionContent/constants";
import { getCollectionItemsScope } from "metabase/collections/components/CollectionContent/utils";
import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSidesheetClose } from "metabase/common/components/Sidesheet";
import { Anchor, Flex, Repeat, Skeleton, Text } from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type { Collection } from "metabase-types/api";

const SKELETON_ROWS = 3;

const PLURAL_LABEL_BY_MODEL: Record<CollectionTypeFilterModel, () => string> = {
  collection: () => t`Collections`,
  dashboard: () => t`Dashboards`,
  dataset: () => t`Models`,
  card: () => t`Questions`,
  metric: () => t`Metrics`,
  document: () => t`Documents`,
  exploration: () => t`Research`,
  table: () => t`Tables`,
};

type CollectionContentsSectionProps = {
  collection: Collection;
  onFilterByType?: (model: CollectionTypeFilterModel) => void;
};

/**
 * Item counts per type, in the type filter's order. The metadata request
 * tells which types are present; each present type then gets one count-only
 * items request with the same scope as the items table.
 */
export const CollectionContentsSection = ({
  collection,
  onFilterByType,
}: CollectionContentsSectionProps) => {
  const scope = getCollectionItemsScope(collection);
  const { data, error, isLoading } = useGetCollectionItemsMetadataQuery({
    id: collection.id,
    ...scope,
  });
  const availableModels = data?.available_models ?? [];
  const presentModels = TYPE_FILTER_MODELS.filter((model) =>
    availableModels.includes(model),
  );

  return (
    <SidebarSection title={t`Contents`}>
      {error ? (
        <LoadingAndErrorWrapper error={error} />
      ) : (
        <DetailsTable>
          {isLoading && (
            <Repeat times={SKELETON_ROWS}>
              <Flex px="lg" py="sm">
                <Skeleton h="1rem" natural />
              </Flex>
            </Repeat>
          )}
          {data && presentModels.length === 0 && (
            <Text px="lg" py="sm" c="text-secondary">
              {t`This collection is empty.`}
            </Text>
          )}
          {presentModels.map((model) => (
            <CollectionContentsRow
              key={model}
              collection={collection}
              model={model}
              onFilterByType={onFilterByType}
            />
          ))}
        </DetailsTable>
      )}
    </SidebarSection>
  );
};

const CollectionContentsRow = ({
  collection,
  model,
  onFilterByType,
}: CollectionContentsSectionProps & { model: CollectionTypeFilterModel }) => {
  const label = PLURAL_LABEL_BY_MODEL[model]();
  const closeSidesheet = useSidesheetClose();
  const { data, isLoading } = useListCollectionItemsQuery({
    id: collection.id,
    ...getCollectionItemsScope(collection, { models: [model] }),
    limit: 0,
    offset: 0,
  });

  return (
    <DetailsRow
      label={label}
      value={
        <CollectionContentsCount
          count={data?.total}
          isLoading={isLoading}
          label={label}
          onClick={
            onFilterByType &&
            (() => {
              // Filter first, so the list updates while the panel slides away
              onFilterByType(model);
              closeSidesheet();
            })
          }
        />
      }
    />
  );
};

const CollectionContentsCount = ({
  count,
  isLoading,
  label,
  onClick,
}: {
  count: number | undefined;
  isLoading: boolean;
  label: string;
  onClick?: () => void;
}) => {
  if (isLoading) {
    return <Skeleton h="1rem" w="2rem" />;
  }

  if (count === undefined) {
    return <Text c="text-secondary">{EMPTY_CELL_PLACEHOLDER}</Text>;
  }

  if (onClick) {
    return (
      <Anchor
        component="button"
        type="button"
        fz="md"
        fw="bold"
        aria-label={t`Show only ${label}`}
        onClick={onClick}
      >
        {count}
      </Anchor>
    );
  }

  return <Text fw="bold">{count}</Text>;
};
