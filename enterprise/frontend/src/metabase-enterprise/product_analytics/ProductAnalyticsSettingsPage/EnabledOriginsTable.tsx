import { t } from "ttag";

import { ClientSortableTable } from "metabase/common/components/Table";
import {
  ActionIcon,
  Button,
  Group,
  Icon,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import type { ProductAnalyticsSite } from "metabase-enterprise/api/product-analytics";

const ENABLED_ORIGINS_COLUMNS = [
  {
    key: "name",
    get name() {
      return t`Name`;
    },
  },
  {
    key: "allowed_domains",
    get name() {
      return t`Allowed domains`;
    },
  },
  { key: "actions", name: "", sortable: false },
];

export function EnabledOriginsTable({
  sites,
  onAddSite,
  onViewSite,
  onDeleteSite,
}: {
  sites: ProductAnalyticsSite[];
  onAddSite: () => void;
  onViewSite: (site: ProductAnalyticsSite) => void;
  onDeleteSite: (site: ProductAnalyticsSite) => void;
}) {
  const archiveActionLabel = t`Archive`;
  return (
    <Stack gap="md">
      {sites.length === 0 ? (
        <Text c="text-secondary">{t`No origins have been enabled yet.`}</Text>
      ) : (
        <ClientSortableTable
          columns={ENABLED_ORIGINS_COLUMNS}
          rows={sites}
          rowRenderer={(site) => (
            <tr>
              <td style={{ width: "20%" }}>{site.name}</td>
              <td style={{ width: "75%" }}>{site.allowed_domains}</td>
              <td style={{ minWidth: "162px" }}>
                <Group gap="md" wrap="nowrap">
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => onViewSite(site)}
                  >{t`View details`}</Button>

                  <Tooltip
                    label={archiveActionLabel}
                    aria-label={archiveActionLabel}
                  >
                    <ActionIcon
                      color="error"
                      variant="subtle"
                      aria-label={archiveActionLabel}
                      onClick={() => onDeleteSite(site)}
                    >
                      <Icon name="trash" />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </td>
            </tr>
          )}
        />
      )}
      <div>
        <Button variant="filled" onClick={onAddSite}>{t`Add origin`}</Button>
      </div>
    </Stack>
  );
}
