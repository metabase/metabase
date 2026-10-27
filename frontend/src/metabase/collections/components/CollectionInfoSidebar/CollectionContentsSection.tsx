import { t } from "ttag";
import _ from "underscore";

import { useListCollectionItemsQuery } from "metabase/api";
import { TYPE_FILTER_MODELS } from "metabase/collections/components/CollectionContent/constants";
import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { useSidesheetClose } from "metabase/common/components/Sidesheet";
import { Anchor, Flex, Repeat, Skeleton } from "metabase/ui";
import type { Collection, CollectionItemModel } from "metabase-types/api";

// In table order, each item type with its plural label
const CONTENT_TYPES: { model: CollectionItemModel; getLabel: () => string }[] =
  [
    { model: "collection", getLabel: () => t`Collections` },
    { model: "dashboard", getLabel: () => t`Dashboards` },
    { model: "card", getLabel: () => t`Questions` },
    { model: "dataset", getLabel: () => t`Models` },
    { model: "metric", getLabel: () => t`Metrics` },
    { model: "document", getLabel: () => t`Documents` },
    { model: "exploration", getLabel: () => t`Research` },
    { model: "transform", getLabel: () => t`Transforms` },
    { model: "table", getLabel: () => t`Tables` },
    { model: "measure", getLabel: () => t`Measures` },
    { model: "action", getLabel: () => t`Actions` },
    { model: "snippet", getLabel: () => t`Snippets` },
    { model: "indexed-entity", getLabel: () => t`Indexed records` },
  ];

export const CollectionContentsSection = ({
  collection,
  onFilterByType,
}: {
  collection: Collection;
  /** makes counts of filterable types clickable */
  onFilterByType?: (model: CollectionItemModel) => void;
}) => {
  // Unpaged, so every item is counted; the endpoint has no per-type totals.
  const { data, isLoading } = useListCollectionItemsQuery({
    id: collection.id,
  });
  const countsByModel = _.countBy(data?.data ?? [], (item) => item.model);
  const rows = CONTENT_TYPES.filter(({ model }) => countsByModel[model] > 0);

  return (
    <SidebarSection title={t`Contents`}>
      <DetailsTable>
        {isLoading ? (
          <Repeat times={3}>
            <Flex px="lg" py="sm">
              <Skeleton h="1rem" natural />
            </Flex>
          </Repeat>
        ) : rows.length === 0 ? (
          <DetailsRow label={t`This collection is empty.`} value="" spanLabel />
        ) : (
          rows.map(({ model, getLabel }) => {
            const count = String(countsByModel[model]);
            const isFilterable =
              onFilterByType != null &&
              TYPE_FILTER_MODELS.some((filterModel) => filterModel === model);

            return (
              <DetailsRow
                key={model}
                label={getLabel()}
                value={
                  isFilterable ? (
                    <FilterByTypeButton
                      count={count}
                      label={getLabel()}
                      onClick={() => onFilterByType(model)}
                    />
                  ) : (
                    count
                  )
                }
              />
            );
          })
        )}
      </DetailsTable>
    </SidebarSection>
  );
};

const FilterByTypeButton = ({
  count,
  label,
  onClick,
}: {
  count: string;
  label: string;
  onClick: () => void;
}) => {
  const closeSidesheet = useSidesheetClose();

  return (
    <Anchor
      component="button"
      type="button"
      fz="md"
      fw="bold"
      aria-label={t`Show only ${label}`}
      onClick={() => {
        // Filter first, so the list updates while the panel slides away
        onClick();
        closeSidesheet();
      }}
    >
      {count}
    </Anchor>
  );
};
