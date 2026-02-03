import { useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { SearchFilter } from "metabase/admin/people/components/SearchFilter";
import {
  ACTIVE_STATUS,
  type ActiveStatus,
} from "metabase/admin/people/constants";
import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { ForwardRefLink } from "metabase/common/components/Link";
import { UserAvatar } from "metabase/common/components/UserAvatar";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import { regexpEscape } from "metabase/lib/string";
import {
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Menu,
  Text,
  UnstyledButton,
} from "metabase/ui";
import { tenantIdToColor } from "metabase-enterprise/tenants/utils/colors";
import * as Urls from "metabase-enterprise/urls";
import type { Tenant } from "metabase-types/api";

import { TenantsListingEmptyState } from "../TenantsListingEmptyState";

interface TenantsListingProps {
  tenants: Tenant[];
  isAdmin: boolean;
  children?: React.ReactNode;
  searchInputValue: string;
  setSearchInputValue: (value: string) => void;
  status: ActiveStatus;
  hasNoTenants: boolean;
}

export const TenantsListing = ({
  tenants,
  isAdmin,
  searchInputValue,
  setSearchInputValue,
  status,
  children,
  hasNoTenants,
}: TenantsListingProps) => {
  const dispatch = useDispatch();

  const openNewTenantModal = () => {
    const param = hasNoTenants ? "?onboarding=true" : "";

    dispatch(push(Urls.newTenant() + param));
  };

  const filteredTenants = useMemo(() => {
    const filter = new RegExp(`\\b${regexpEscape(searchInputValue)}`, "i");
    return tenants.filter((g) => filter.test(g.name));
  }, [searchInputValue, tenants]);

  if (hasNoTenants) {
    return <TenantsListingEmptyState onCreateTenant={openNewTenantModal} />;
  }

  return (
    <div>
      <Group w="100%" justify="space-between" mb="lg" gap="md">
        <Flex flex="1">
          <SearchFilter
            value={searchInputValue}
            onChange={setSearchInputValue}
            placeholder={t`Find a tenant`}
          />
        </Flex>

        {isAdmin && (
          <Flex gap="sm">
            <Button
              variant="filled"
              onClick={openNewTenantModal}
            >{t`New tenant`}</Button>
          </Flex>
        )}
      </Group>

      <AdminContentTable columnTitles={[t`Tenant`, t`Slug`, t`Users`]}>
        {filteredTenants.map((tenant) => (
          <tr key={tenant.id}>
            <td>
              <Flex
                component={ForwardRefLink}
                align="center"
                to={Urls.editTenant(tenant.id)}
                className={CS.link}
                gap="md"
              >
                <UserAvatar
                  user={{ first_name: tenant.name }}
                  bg={tenantIdToColor(tenant.id)}
                />
                <Box component="span" fw={700} c="brand">
                  {tenant.name}
                </Box>
              </Flex>
            </td>
            <td>{tenant.slug}</td>
            <td>{tenant.member_count || 0}</td>
            <Box component="td" ta="end">
              <ActionsPopover tenant={tenant} />
            </Box>
          </tr>
        ))}
      </AdminContentTable>

      {((tenants.length !== 0 && filteredTenants.length === 0) ||
        (tenants.length === 0 && status === ACTIVE_STATUS.deactivated)) && (
        <Text size="lg" fw="700" ta="center" mt="xl" py="xl" c="text-tertiary">
          {t`No matching tenants found.`}
        </Text>
      )}

      {tenants.length === 0 && status === ACTIVE_STATUS.active && (
        <Text size="lg" fw="700" ta="center" mt="xl" py="xl" c="text-tertiary">
          {t`Add your first tenant to get started.`}
        </Text>
      )}

      {children}
    </div>
  );
};

interface ActionsPopoverProps {
  tenant: Tenant;
}

function ActionsPopover({ tenant }: ActionsPopoverProps) {
  return (
    <Menu shadow="md" width={200} position="bottom-end">
      <Menu.Target>
        <UnstyledButton>
          <Icon c="text-tertiary" name="ellipsis" />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item component={ForwardRefLink} to={Urls.editTenant(tenant.id)}>
          {t`Edit tenant`}
        </Menu.Item>
        {tenant.is_active ? (
          <Menu.Item
            c="danger"
            component={ForwardRefLink}
            to={Urls.deactivateTenant(tenant.id)}
          >
            {t`Deactivate tenant`}
          </Menu.Item>
        ) : (
          <Menu.Item
            c="danger"
            component={ForwardRefLink}
            to={Urls.reactivateTenant(tenant.id)}
          >
            {t`Reactivate tenant`}
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
