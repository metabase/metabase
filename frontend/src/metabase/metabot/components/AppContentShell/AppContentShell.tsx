import cx from "classnames";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { push } from "react-router-redux";
import { tinykeys } from "tinykeys";

import { ContentViewportContext } from "metabase/common/context/ContentViewportContext";
import { trackMetabotChatOpened } from "metabase/metabot/analytics";
import { MetabotEntityLauncher } from "metabase/metabot/components/MetabotEntityLauncher";
import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import { useDispatch, useSelector } from "metabase/redux";
import { getIsNavbarOpen } from "metabase/selectors/app";

import S from "./AppContentShell.module.css";

interface AppContentShellProps {
  children: ReactNode;
  showChrome?: boolean;
}

export function AppContentShell({
  children,
  showChrome = true,
}: AppContentShellProps) {
  const [viewportElement, setViewportElement] = useState<HTMLElement | null>(
    null,
  );
  const dispatch = useDispatch();
  const isNavbarOpen = useSelector(getIsNavbarOpen);
  const { hasMetabotAccess } = useUserMetabotPermissions();

  const handleOpenMetabot = useCallback(() => {
    dispatch(push("/"));
    trackMetabotChatOpened("keyboard_shortcut");
  }, [dispatch]);

  useEffect(() => {
    if (!showChrome || !hasMetabotAccess) {
      return;
    }
    return tinykeys(window, {
      "$mod+e": (e) => {
        e.preventDefault();
        handleOpenMetabot();
      },
    });
  }, [showChrome, hasMetabotAccess, handleOpenMetabot]);

  return (
    <div
      className={cx(S.shell, {
        [S.shellBare]: !showChrome,
        [S.shellNavCollapsed]: showChrome && !isNavbarOpen,
      })}
    >
      <div className={S.contentArea}>
        <main
          className={cx(S.content, { [S.contentBare]: !showChrome })}
          ref={setViewportElement}
        >
          <ContentViewportContext.Provider value={viewportElement ?? null}>
            {children}
          </ContentViewportContext.Provider>
        </main>
      </div>
      {showChrome && <MetabotEntityLauncher />}
    </div>
  );
}
