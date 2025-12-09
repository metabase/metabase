import { t } from "ttag";

import { BrowserCrumbs } from "metabase/common/components/BrowserCrumbs";
import { Grid } from "metabase/common/components/Grid";
import Link from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { ROOT_COLLECTION } from "metabase/entities/collections/constants";
import * as Urls from "metabase/lib/urls";
import { Box, Card, Flex, Group, Icon, Loader } from "metabase/ui";
import { useListTenantsQuery } from "metabase-enterprise/api";

import { ListGridItem, ListHeader } from "./TenantCollectionList.styled";

export const TenantCollectionList = () => {
  const { data, isLoading } = useListTenantsQuery({ status: "active" });

  const tenants = data?.data ?? [];

  return (
    <Flex direction="column" p="1.5rem" h="100%">
      <ListHeader>
        <BrowserCrumbs
          crumbs={[
            {
              title: ROOT_COLLECTION.name,
              to: Urls.collection({ id: "root", name: "" }),
            },
            { title: t`Tenant collections` },
          ]}
        />
      </ListHeader>
      <Box style={{ flexGrow: 1, overflowY: "auto" }} pr="0.5rem">
        {isLoading ? (
          <Flex justify="center" align="center" h="100%">
            <Loader size="lg" />
          </Flex>
        ) : (
          <Grid>
            {tenants.map(
              (tenant) =>
                tenant.tenant_collection_id && (
                  <ListGridItem key={tenant.id} role="list-item">
                    <Link to={`/collection/${tenant.tenant_collection_id}`}>
                      <Card shadow="none" withBorder>
                        <Group gap="xs">
                          <Icon
                            name="folder"
                            className={CS.mr1}
                            c="text-medium"
                            size={18}
                          />

                          <h3>{tenant.name}</h3>
                        </Group>
                      </Card>
                    </Link>
                  </ListGridItem>
                ),
            )}
          </Grid>
        )}
      </Box>
    </Flex>
  );
};
