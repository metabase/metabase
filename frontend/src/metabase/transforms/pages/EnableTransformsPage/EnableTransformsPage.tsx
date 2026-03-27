import { t } from "ttag";

import { useUpdateSettingMutation } from "metabase/api";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { Center } from "metabase/ui";

import { EnableTransformsCard } from "./EnableTransformsCard";

export const EnableTransformsPage = () => {
  const [updateSetting, { isLoading: updateSettingLoading }] =
    useUpdateSettingMutation();

  const enableTransforms = () =>
    updateSetting({
      key: "transforms-enabled",
      value: true,
    });

  return (
    <PageContainer data-testid="enable-transform-page">
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Transforms`}</DataStudioBreadcrumbs>
        }
      />
      <Center>
        <EnableTransformsCard
          onEnableClick={enableTransforms}
          loading={updateSettingLoading}
        />
      </Center>
    </PageContainer>
  );
};
