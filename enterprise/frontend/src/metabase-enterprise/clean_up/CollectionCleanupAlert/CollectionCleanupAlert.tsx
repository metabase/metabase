import { c } from "ttag";

import { skipToken } from "metabase/api";
import { useUserSetting } from "metabase/common/hooks";
import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Alert, Box, Icon } from "metabase/ui";
import { useListStaleCollectionItemsQuery } from "metabase-enterprise/api/collection";
import type { Collection } from "metabase-types/api";

import { getDateFilterValue } from "../CleanupCollectionModal/utils";

export const CollectionCleanupAlert = ({
  collection,
}: {
  collection: Collection;
}) => {
  const [dismissed, setDismissed] = useUserSetting(
    "dismissed-collection-cleanup-banner",
  );
  const isAdmin = useSelector(getUserIsAdmin);
  const shouldFetchStaleItems =
    isAdmin && !dismissed && PLUGIN_COLLECTIONS.canCleanUp(collection);

  const {
    data: staleItems,
    isLoading,
    error,
  } = useListStaleCollectionItemsQuery(
    shouldFetchStaleItems
      ? {
          id: collection.id,
          limit: 0, // only fetch pagination info
          before_date: getDateFilterValue("three-months"), // set to 3 months ago
        }
      : skipToken,
  );
  const totalStaleItems = shouldFetchStaleItems ? (staleItems?.total ?? 0) : 0;

  if (isLoading || error || totalStaleItems <= 0) {
    return null;
  }

  return (
    <Alert
      data-testid="cleanup-alert"
      icon={<Icon name="ai" size={16} />}
      withCloseButton
      onClose={() => setDismissed(true)}
      styles={{
        root: { padding: 0, marginTop: "-.5rem", marginBottom: "2rem" },
        icon: { marginRight: ".5rem" },
        wrapper: {
          backgroundColor: color("brand-lighter"),
          padding: "1rem 1.5rem",
        },
        closeButton: {
          color: "var(--mb-color-text-dark)",
        },
      }}
    >
      <Box fz="md" c={"text-dark"}>
        {c(
          "This is the heading of a banner that invites the user to clean up a collection.",
        ).t`Keep your collections tidy!`}{" "}
        <Box
          component={Link}
          ml="2.5rem"
          fw="bold"
          variant="brand"
          to={`${Urls.collection(collection)}/cleanup`}
        >
          {c(
            "This is the heading of a banner that invites the user to clean up a collection.",
          ).t`View unused items and select which ones to move to the trash.`}
        </Box>
      </Box>
    </Alert>
  );
};
