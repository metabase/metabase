import cx from "classnames";
import type { ReactNode } from "react";
import { useState } from "react";

import ErrorBoundary from "metabase/ErrorBoundary";
import { ContentViewportContext } from "metabase/common/context/ContentViewportContext";
import { MetabotConversationView } from "metabase/metabot/components/MetabotPage/MetabotConversationView";
import {
  collapseConversation,
  getOverlayAgentId,
} from "metabase/metabot/state";
import { useDispatch, useSelector } from "metabase/redux";

import { MetabotBar } from "../MetabotBar/MetabotBar";

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
  const overlayAgentId = useSelector(getOverlayAgentId);

  return (
    <div
      className={cx(S.shell, {
        [S.shellBare]: !showChrome,
        [S.shellExpanded]: showChrome && !!overlayAgentId,
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
        {showChrome && overlayAgentId && (
          <div className={S.overlay} data-testid="metabot-expanded-chat">
            <ErrorBoundary errorComponent={() => null}>
              <MetabotConversationView
                agentId={overlayAgentId}
                isNewConversation={false}
                alwaysShowConversation
                onCollapse={() =>
                  dispatch(collapseConversation({ agentId: overlayAgentId }))
                }
              />
            </ErrorBoundary>
          </div>
        )}
      </div>
      {showChrome && <MetabotBar />}
    </div>
  );
}
