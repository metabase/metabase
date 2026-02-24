import { useCallback, useState } from "react";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { ClientSortableTable } from "metabase/common/components/Table";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import {
  Button,
  Code,
  Group,
  Icon,
  Modal,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import type { ProductAnalyticsSite } from "metabase-enterprise/api/product-analytics";
import {
  useCreateProductAnalyticsSiteMutation,
  useDeleteProductAnalyticsSiteMutation,
  useGetProductAnalyticsSiteQuery,
  useListProductAnalyticsSitesQuery,
} from "metabase-enterprise/api/product-analytics";

import { AdminSettingInput } from "../widgets/AdminSettingInput";

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

type AddSiteFormValues = {
  name: string;
  allowed_domains: string;
};

function AddSiteModal({ onClose }: { onClose: () => void }) {
  const [createProductAnalyticsSite] = useCreateProductAnalyticsSiteMutation();

  const handleSubmit = useCallback(
    async ({ name, allowed_domains }: AddSiteFormValues) => {
      await createProductAnalyticsSite({ name, allowed_domains }).unwrap();
      onClose();
    },
    [createProductAnalyticsSite, onClose],
  );

  return (
    <Modal size="30rem" opened onClose={onClose} title={t`Add site`}>
      <FormProvider
        initialValues={{ name: "", allowed_domains: "" }}
        onSubmit={handleSubmit}
      >
        <Form>
          <Stack gap="md">
            <FormTextInput name="name" label={t`Name`} size="sm" required />
            <FormTextarea
              name="allowed_domains"
              label={t`Allowed domains`}
              description={t`Separate multiple domains with a space or new line.`}
              placeholder="https://example.com, https://*.example.com"
              size="sm"
              required
            />
            <FormErrorMessage />
            <Group justify="flex-end">
              <Button onClick={onClose}>{t`Cancel`}</Button>
              <FormSubmitButton variant="filled" label={t`Add site`} />
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
            <Text>{t`Are you sure you want to remove ${site.name}? This will disable analytics tracking for all its allowed domains.`}</Text>
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

function SiteDetailsModal({
  site,
  onClose,
}: {
  site: ProductAnalyticsSite;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useGetProductAnalyticsSiteQuery(site.id);

  return (
    <Modal size="40rem" opened onClose={onClose} title={site.name}>
      <Stack gap="md">
        <DelayedLoadingAndErrorWrapper loading={isLoading} error={error}>
          <Stack gap="sm">
            <Text fw="bold">{t`Tracking snippet`}</Text>
            <Code block>{data?.tracking_snippet ?? ""}</Code>
          </Stack>
        </DelayedLoadingAndErrorWrapper>
        <Group justify="flex-end">
          <Button onClick={onClose}>{t`Close`}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function EnabledOriginsTable({
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

export function ProductAnalyticsSettingsPage() {
  // const productAnalyticsEnabled = useSetting("enable-product-analytics?");
  const productAnalyticsEnabled = true;

  const {
    data: sites,
    isLoading,
    error,
  } = useListProductAnalyticsSitesQuery(undefined, {
    skip: !productAnalyticsEnabled,
  });

  const [showAddModal, setShowAddModal] = useState(false);
  const [siteToView, setSiteToView] = useState<ProductAnalyticsSite | null>(
    null,
  );
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
            <DelayedLoadingAndErrorWrapper loading={isLoading} error={error}>
              <EnabledOriginsTable
                sites={sites ?? []}
                onAddSite={() => setShowAddModal(true)}
                onViewSite={setSiteToView}
                onDeleteSite={setSiteToDelete}
              />
            </DelayedLoadingAndErrorWrapper>
          </SettingsSection>
        )}
      </SettingsSection>

      {showAddModal && <AddSiteModal onClose={() => setShowAddModal(false)} />}
      {siteToView && (
        <SiteDetailsModal
          site={siteToView}
          onClose={() => setSiteToView(null)}
        />
      )}
      {siteToDelete && (
        <DeleteSiteModal
          site={siteToDelete}
          onClose={() => setSiteToDelete(null)}
        />
      )}
    </SettingsPageWrapper>
  );
}
