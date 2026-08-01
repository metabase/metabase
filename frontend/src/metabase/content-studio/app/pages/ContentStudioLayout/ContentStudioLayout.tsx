import { t } from "ttag";

import ContentStudioLogo from "assets/img/content-studio-logo.svg";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import {
  AreaLayout,
  AreaMain,
  AreaTab,
} from "metabase/nav/components/AreaLayout";
import { PLUGIN_CONTENT_STUDIO } from "metabase/plugins";
import { Outlet } from "metabase/router";

const REMOTE_SYNC_SETTINGS_PATH = "/admin/settings/remote-sync";

export function ContentStudioLayout() {
  const {
    value: _isNavbarOpened,
    setValue: setIsNavbarOpened,
    isLoading: isLoadingNavbarKey,
  } = useUserKeyValue({
    namespace: "content_studio",
    key: "isNavbarOpened",
  });
  const isNavbarOpened = _isNavbarOpened !== false;

  const upperNav = (
    <PLUGIN_CONTENT_STUDIO.ContentStudioSidebar
      isNavbarOpened={isNavbarOpened}
    />
  );

  const lowerNav = (
    <>
      <PLUGIN_CONTENT_STUDIO.ContentStudioSyncControls
        isNavbarOpened={isNavbarOpened}
      />
      <AreaTab
        label={t`Remote sync settings`}
        icon="gear"
        to={REMOTE_SYNC_SETTINGS_PATH}
        showLabel={isNavbarOpened}
      />
    </>
  );

  return (
    <PLUGIN_CONTENT_STUDIO.ContentStudioProvider>
      <AreaLayout
        logo={
          <img
            alt={t`Content Studio Logo`}
            src={ContentStudioLogo}
            width={32}
            height={32}
            style={{ display: "block" }}
          />
        }
        testId="content-studio-nav"
        isLoading={isLoadingNavbarKey}
        isNavbarOpened={isNavbarOpened}
        onNavbarToggle={setIsNavbarOpened}
        upperNav={upperNav}
        lowerNav={lowerNav}
      >
        <AreaMain>
          <Outlet />
        </AreaMain>
      </AreaLayout>
    </PLUGIN_CONTENT_STUDIO.ContentStudioProvider>
  );
}
