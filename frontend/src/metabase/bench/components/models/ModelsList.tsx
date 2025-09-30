import { getIcon } from "metabase/browse/models/utils";
import PinnedItemCard from "metabase/collections/components/PinnedItemCard";
import EntityItem from "metabase/common/components/EntityItem";
import { MaybeItemLink } from "metabase/common/components/ItemsTable/BaseItemsTable.styled";
import { Box, Icon, Repeat } from "metabase/ui";
import type { RecentCollectionItem } from "metabase-types/api";

import styles from "./ModelsList.module.css";

export function ModelsList({
  models = [],
  skeleton,
}: {
  models?: RecentCollectionItem[];
  skeleton?: boolean;
}) {
  if (!skeleton && models.length === 0) {
    return null;
  }
  return (
    <Box
      w="100%"
      my="lg"
      role="grid"
      mah={skeleton ? "11rem" : undefined}
      style={skeleton ? { overflow: "hidden" } : undefined}
    >
      <Box className={styles.modelsList}>
        {skeleton ? (
          <Repeat times={2}>
            <PinnedItemCard skeleton iconForSkeleton="model" />
          </Repeat>
        ) : (
          models.map((model) => {
            const icon = getIcon(model);

            return (
              <MaybeItemLink
                key={model.id}
                to={
                  model
                    ? `/bench/models/${model.id}` // TODO: proper URL generator
                    : undefined
                }
                style={{
                  // To align the icons with "Name" in the <th>
                  paddingInlineStart: "1.4rem",
                  paddingInlineEnd: ".5rem",
                }}
              >
                <Icon
                  size={16}
                  {...icon}
                  color="var(--mb-color-icon-primary)"
                  style={{ flexShrink: 0 }}
                />
                {<EntityItem.Name name={model?.name || ""} variant="list" />}
              </MaybeItemLink>
            );
          })
        )}
      </Box>
    </Box>
  );
}
