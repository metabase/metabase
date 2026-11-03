import { t } from "ttag";

import type {
  EntityPickerOptions,
  OmniPickerItem,
} from "metabase/common/components/Pickers";
import type { TableId } from "metabase-types/api";

type EventTablePickerOptionsArgs = {
  setUpTableIds: ReadonlySet<TableId>;
  /** Whether the user can set up a table in Data Studio. */
  canSetUpTables: boolean;
};

/**
 * The full data picker's options for event tables. Only someone who can set
 * up a table can pick one that isn't set up; anyone else sees why not.
 * Tables don't live in the root or personal collections, but published ones
 * live in the library.
 */
export const getEventTablePickerOptions = ({
  setUpTableIds,
  canSetUpTables,
}: EventTablePickerOptionsArgs) => {
  const isUnavailable = (item: OmniPickerItem) =>
    !canSetUpTables && item.model === "table" && !setUpTableIds.has(item.id);
  const options: EntityPickerOptions = {
    hasRootCollection: false,
    hasPersonalCollections: false,
    getItemTooltip: (item) =>
      isUnavailable(item)
        ? t`This table isn't set up for product analysis. Ask an admin to set it up in Data Studio.`
        : undefined,
  };
  return { shouldDisableItem: isUnavailable, options };
};
