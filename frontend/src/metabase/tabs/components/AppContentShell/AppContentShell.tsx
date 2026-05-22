import type { ReactNode } from "react";
import { useState } from "react";

import { ContentViewportContext } from "metabase/common/context/ContentViewportContext";

import { MetabotBar } from "../MetabotBar/MetabotBar";
import { TabBar } from "../TabBar/TabBar";

import S from "./AppContentShell.module.css";

interface AppContentShellProps {
  children: ReactNode;
}

export function AppContentShell({ children }: AppContentShellProps) {
  const [viewportElement, setViewportElement] = useState<HTMLElement | null>(
    null,
  );

  return (
    <div className={S.shell}>
      <TabBar />
      <main className={S.content} ref={setViewportElement}>
        <ContentViewportContext.Provider value={viewportElement ?? null}>
          {children}
        </ContentViewportContext.Provider>
      </main>
      <MetabotBar />
    </div>
  );
}
