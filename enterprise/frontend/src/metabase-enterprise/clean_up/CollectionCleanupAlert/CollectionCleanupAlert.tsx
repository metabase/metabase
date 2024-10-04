import { t } from "ttag";

import { skipToken } from "metabase/api";
import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Alert, Box, Icon } from "metabase/ui";
import { useListStaleCollectionItemsQuery } from "metabase-enterprise/api/collection";
import type { Collection } from "metabase-types/api";

export const CollectionCleanupAlert = ({
  collection,
}: {
  collection: Collection;
}) => {
  const isAdmin = useSelector(getUserIsAdmin);

  const {
    data: staleItems,
    isLoading,
    error,
  } = useListStaleCollectionItemsQuery(
    isAdmin
      ? {
          id: collection.id,
          limit: 0, // only fetch pagination info
        }
      : skipToken,
  );

  const hasSomethingToCleanUp = (staleItems?.total ?? 0) > 0;

  if (isLoading || error || !hasSomethingToCleanUp) {
    return null;
  }

  return (
    <Alert
      data-testid="cleanup-alert"
      icon={<Icon name="ai" size={16} />}
      styles={{
        root: { padding: 0, marginTop: "-.5rem", marginBottom: "2rem" },
        icon: { marginRight: ".5rem" },
        wrapper: {
          backgroundColor: color("brand-lighter"),
          padding: "1rem 1.5rem",
        },
      }}
    >
      <Box fz="md" c={"text-dark"}>
        {t`Clean things up!`}{" "}
        <Box
          component={Link}
          ml="2.5rem"
          fw="bold"
          variant="brand"
          to={`${Urls.collection(collection)}/cleanup`}
        >
          {t`Get rid of unused content`}
        </Box>
      </Box>
    </Alert>
  );
};
