import cx from "classnames";
import type { ReactNode } from "react";
import { useState } from "react";

import { ContentViewportContext } from "metabase/common/context/ContentViewportContext";

import { MetabotBar } from "../MetabotBar/MetabotBar";
import { TabBar } from "../TabBar/TabBar";

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
      {showChrome && <TabBar />}
      <main
        className={cx(S.content, { [S.contentBare]: !showChrome })}
        ref={setViewportElement}
      >
        <ContentViewportContext.Provider value={viewportElement ?? null}>
          {children}
        </ContentViewportContext.Provider>
      </main>
      {showChrome && <MetabotBar />}
    </div>
  );
}
