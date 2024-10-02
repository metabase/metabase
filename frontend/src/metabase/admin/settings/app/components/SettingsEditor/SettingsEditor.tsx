import { useRef } from "react";
import { withRouter } from "react-router";
import { useMount } from "react-use";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import {
  getSections,
} from "metabase/admin/settings/selectors";
import {
  initializeSettings,
} from "metabase/admin/settings/settings";
import { AdminLayout } from "metabase/components/AdminLayout";
import SaveStatus from "metabase/components/SaveStatus";
import { SetTitle } from "metabase/hoc/Title";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box } from "metabase/ui";

import {
  SettingsPane,
  SettingsSectionSidebar,
  UpsellSection,
} from "./components";
import { SettingDefinition } from "metabase-types/api";
import { t } from "ttag";
import { EnterpriseSettingKey } from "metabase-enterprise/settings/types";

export const SettingsEditor = withRouter(({ params }) => {
  const dispatch = useDispatch();

  // export const getActiveSectionName = (state, props): AdminSettingSectionKey =>
  //   props.params.splat;
  const activeSectionName = params.splat ?? "setup";
  const sections = useSelector(getSections);
  const activeSection = sections[activeSectionName] ?? null;

  const saveStatusRef = useRef(null);

  useMount(() => {
    dispatch(initializeSettings());
  });

  return (
    <>
      <SetTitle title={activeSection && activeSection.name} />
      <AdminLayout
        sidebar={
          <SettingsSectionSidebar
            sections={sections}
            activeSectionName={activeSectionName}
          />
        }
        upsell={<UpsellSection activeSectionName={activeSectionName} />}
      >
        <Box w="100%">
          <SaveStatus ref={saveStatusRef} />
          <ErrorBoundary>
            <SettingsPane
              activeSection={activeSection}
              settings={[]}
              settingValues={undefined}
              derivedSettingValues={undefined}
            />
          </ErrorBoundary>
        </Box>
      </AdminLayout>
    </>
  );
});


