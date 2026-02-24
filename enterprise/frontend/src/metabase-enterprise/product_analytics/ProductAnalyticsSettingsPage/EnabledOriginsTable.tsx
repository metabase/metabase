import { t } from "ttag";

import { ClientSortableTable } from "metabase/common/components/Table";
import { Button, Group, Icon, Stack, Text } from "metabase/ui";
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
              <td>{site.name}</td>
              <td>{site.allowed_domains}</td>
              <td>
                <Group gap="md">
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => onViewSite(site)}
                  >{t`View details`}</Button>
                  <Icon
                    name="trash"
                    style={{ cursor: "pointer" }}
                    onClick={() => onDeleteSite(site)}
                  />
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
