import { t } from "ttag";

import { useUpdateSettingMutation } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Center, Text } from "metabase/ui";

import { EnableTransformsCard } from "./EnableTransformsCard";

export const EnableTransformsPage = () => {
  const isAdmin = useSelector(getUserIsAdmin);
  const adminEmail = useSetting("admin-email");
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
          permissionsErrorMessage={
            !isAdmin && (
              <Text fz="1rem" fw="bold">
                {t`To enable Transforms, please contact your administrator`}
                {adminEmail && ` (${adminEmail})`}.
              </Text>
            )
          }
          loading={updateSettingLoading}
        />
      </Center>
    </PageContainer>
  );
};
