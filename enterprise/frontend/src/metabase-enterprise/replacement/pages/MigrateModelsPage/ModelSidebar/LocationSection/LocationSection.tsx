import { Link } from "react-router";
import { t } from "ttag";

import { ROOT_COLLECTION } from "metabase/entities/collections/constants";
import * as Urls from "metabase/lib/urls";
import type { IconName } from "metabase/ui";
import { Anchor, FixedSizeIcon, Group, Stack } from "metabase/ui";
import type { Database, SearchResult } from "metabase-types/api";

type LocationSectionProps = {
  result: SearchResult;
  database: Database | undefined;
};

export function LocationSection({ result, database }: LocationSectionProps) {
  return (
    <Stack role="region" aria-label={t`Location`} gap="sm">
      {database != null && (
        <LocationLink
          label={database.name}
          icon="database"
          to={Urls.dataStudioData({ databaseId: database.id })}
        />
      )}
      <LocationLink
        label={result.collection.name ?? ROOT_COLLECTION.name}
        icon="folder"
        to={Urls.collection(result.collection)}
      />
    </Stack>
  );
}

type LocationLinkProps = {
  label: string;
  icon: IconName;
  to: string;
};

function LocationLink({ icon, label, to }: LocationLinkProps) {
  return (
    <Anchor component={Link} lh="1rem" to={to} target="_blank">
      <Group gap="sm" wrap="nowrap">
        <FixedSizeIcon name={icon} />
        {label}
      </Group>
    </Anchor>
  );
}
