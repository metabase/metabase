import cx from "classnames";
import type { ReactNode } from "react";
import { useState } from "react";

import { ContentViewportContext } from "metabase/common/context/ContentViewportContext";

import { MetabotLauncher } from "../MetabotBar/MetabotLauncher";

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

  return (
    <div className={cx(S.shell, { [S.shellBare]: !showChrome })}>
      <main
        className={cx(S.content, { [S.contentBare]: !showChrome })}
        ref={setViewportElement}
      >
        <ContentViewportContext.Provider value={viewportElement ?? null}>
          {children}
        </ContentViewportContext.Provider>
      </main>
      {showChrome && (
        <div className={S.bottomBar}>
          <MetabotLauncher />
        </div>
      )}
    </div>
  );
}
