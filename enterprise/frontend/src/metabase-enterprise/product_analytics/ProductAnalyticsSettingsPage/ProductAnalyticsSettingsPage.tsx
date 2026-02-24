import { useState } from "react";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Title } from "metabase/ui";
import type { ProductAnalyticsSite } from "metabase-enterprise/api/product-analytics";
import { useListProductAnalyticsSitesQuery } from "metabase-enterprise/api/product-analytics";

import { AddSiteModal } from "./AddSiteModal";
import { DeleteSiteModal } from "./DeleteSiteModal";
import { EnabledOriginsTable } from "./EnabledOriginsTable";
import { SiteDetailsModal } from "./SiteDetailsModal";

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
