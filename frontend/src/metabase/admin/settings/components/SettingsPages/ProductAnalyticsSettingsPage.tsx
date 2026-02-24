import { useCallback, useState } from "react";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { ClientSortableTable } from "metabase/common/components/Table";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Button, Group, Icon, Modal, Stack, Text, Title } from "metabase/ui";
import type {
  CreateProductAnalyticsSiteRequest,
  ProductAnalyticsSite,
} from "metabase-enterprise/api/product-analytics";
import {
  useCreateProductAnalyticsSiteMutation,
  useDeleteProductAnalyticsSiteMutation,
} from "metabase-enterprise/api/product-analytics";

import { AdminSettingInput } from "../widgets/AdminSettingInput";

const ENABLED_ORIGINS_COLUMNS = [
  {
    key: "origin",
    get name() {
      return t`Origin`;
    },
  },
  {
    key: "api_token",
    get name() {
      return t`API token`;
    },
  },
  { key: "actions", name: "", sortable: false },
];

function AddSiteModal({ onClose }: { onClose: () => void }) {
  const [createProductAnalyticsSite] = useCreateProductAnalyticsSiteMutation();

  const handleSubmit = useCallback(
    async (vals: CreateProductAnalyticsSiteRequest) => {
      await createProductAnalyticsSite(vals).unwrap();
      onClose();
    },
    [createProductAnalyticsSite, onClose],
  );

  return (
    <Modal size="30rem" opened onClose={onClose} title={t`Add origin`}>
      <FormProvider initialValues={{ origin: "" }} onSubmit={handleSubmit}>
        <Form>
          <Stack gap="md">
            <FormTextInput
              name="origin"
              label={t`Origin`}
              placeholder="https://example.com"
              size="sm"
              required
            />
            <FormErrorMessage />
            <Group justify="flex-end">
              <Button onClick={onClose}>{t`Cancel`}</Button>
              <FormSubmitButton variant="filled" label={t`Add origin`} />
            </Group>
          </Stack>
        </Form>
      </FormProvider>
    </Modal>
  );
}

function DeleteSiteModal({
  site,
  onClose,
}: {
  site: ProductAnalyticsSite;
  onClose: () => void;
}) {
  const [deleteProductAnalyticsSite] = useDeleteProductAnalyticsSiteMutation();

  const handleDelete = useCallback(async () => {
    await deleteProductAnalyticsSite(site.id);
    onClose();
  }, [deleteProductAnalyticsSite, site.id, onClose]);

  return (
    <Modal size="30rem" opened onClose={onClose} title={t`Remove origin`}>
      <FormProvider initialValues={{}} onSubmit={handleDelete}>
        <Form>
          <Stack gap="lg">
            <Text>{t`Are you sure you want to remove ${site.origin}? This will disable analytics tracking for this origin.`}</Text>
            <FormErrorMessage />
            <Group justify="flex-end">
              <Button onClick={onClose}>{t`Cancel`}</Button>
              <FormSubmitButton
                label={t`Remove origin`}
                variant="filled"
                color="error"
              />
            </Group>
          </Stack>
        </Form>
      </FormProvider>
    </Modal>
  );
}

function EnabledOriginsTable({
  sites,
  onAddSite,
  onDeleteSite,
}: {
  sites: ProductAnalyticsSite[];
  onAddSite: () => void;
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
              <td>{site.origin}</td>
              <td>{site.api_token}</td>
              <td>
                <Icon
                  name="trash"
                  style={{ cursor: "pointer" }}
                  onClick={() => onDeleteSite(site)}
                />
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

export function ProductAnalyticsSettingsPage() {
  // const productAnalyticsEnabled = useSetting("enable-product-analytics?");
  const productAnalyticsEnabled = true;

  // TODO: replace with useListProductAnalyticsSitesQuery() once GET /api/ee/product-analytics/sites is implemented
  const sites: ProductAnalyticsSite[] = [
    {
      id: 1,
      origin: "http://mysass.com",
      api_token: "api token",
    },
  ];

  const [showAddModal, setShowAddModal] = useState(false);
  const [siteToDelete, setSiteToDelete] = useState<ProductAnalyticsSite | null>(
    null,
  );

  return (
    <SettingsPageWrapper title={t`Product Analytics`}>
      <SettingsSection>
        <AdminSettingInput
          name="enable-product-analytics?"
          title={t`Enabled`}
          inputType="boolean"
        />

        {productAnalyticsEnabled && (
          <SettingsSection>
            <Title order={4}>{t`Enabled origins`}</Title>
            <EnabledOriginsTable
              sites={sites}
              onAddSite={() => setShowAddModal(true)}
              onDeleteSite={setSiteToDelete}
            />
          </SettingsSection>
        )}
      </SettingsSection>

      {showAddModal && <AddSiteModal onClose={() => setShowAddModal(false)} />}
      {siteToDelete && (
        <DeleteSiteModal
          site={siteToDelete}
          onClose={() => setSiteToDelete(null)}
        />
      )}
    </SettingsPageWrapper>
  );
}
