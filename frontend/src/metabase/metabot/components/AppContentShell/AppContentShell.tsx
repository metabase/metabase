import { useReducedMotion } from "@mantine/hooks";
import cx from "classnames";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import ErrorBoundary from "metabase/ErrorBoundary";
import { ContentViewportContext } from "metabase/common/context/ContentViewportContext";
import { MetabotConversationView } from "metabase/metabot/components/MetabotPage/MetabotConversationView";
import {
  collapseConversation,
  getOverlayAgentId,
} from "metabase/metabot/state";
import { useDispatch, useSelector } from "metabase/redux";
import { Transition } from "metabase/ui";

import { MetabotBar } from "../MetabotBar/MetabotBar";

import S from "./AppContentShell.module.css";

interface AppContentShellProps {
  children: ReactNode;
  showChrome?: boolean;
}

const overlayTransition = {
  in: { opacity: 1, transform: "scale(1)" },
  out: { opacity: 0, transform: "scale(0.4)" },
  transitionProperty: "opacity, transform",
};

// fixed horizontal inset (per side) the content card recedes by while a chat
// is expanded. Applied via a computed scaleX so the card never reflows.
const CONTENT_INSET_PX = 8;

export function AppContentShell({
  children,
  showChrome = true,
}: AppContentShellProps) {
  const [viewportElement, setViewportElement] = useState<HTMLElement | null>(
    null,
  );
  const dispatch = useDispatch();
  const overlayAgentId = useSelector(getOverlayAgentId);
  const reduceMotion = useReducedMotion();

  // retain the last expanded agent so the collapse animation has something
  // to render while the overlay transitions out
  const [renderedAgentId, setRenderedAgentId] = useState(overlayAgentId);
  useEffect(() => {
    if (overlayAgentId) {
      setRenderedAgentId(overlayAgentId);
    }
  }, [overlayAgentId]);

  const isOverlayOpen = showChrome && overlayAgentId != null;

  // measure the card so the inset stays a fixed pixel amount per side
  // regardless of screen width
  const [contentWidth, setContentWidth] = useState(0);
  useEffect(() => {
    if (!viewportElement) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      setContentWidth(entry.contentRect.width);
    });
    observer.observe(viewportElement);
    return () => observer.disconnect();
  }, [viewportElement]);

  const insetScaleX =
    isOverlayOpen && contentWidth > 0
      ? (contentWidth - CONTENT_INSET_PX * 2) / contentWidth
      : 1;

  return (
    <div className={cx(S.shell, { [S.shellBare]: !showChrome })}>
      <div className={S.contentArea}>
        <main
          className={cx(S.content, { [S.contentBare]: !showChrome })}
          style={{ transform: `scaleX(${insetScaleX})` }}
          ref={setViewportElement}
        >
          <ContentViewportContext.Provider value={viewportElement ?? null}>
            {children}
          </ContentViewportContext.Provider>
        </main>
        <Transition
          mounted={isOverlayOpen}
          transition={overlayTransition}
          duration={reduceMotion ? 0 : 220}
          exitDuration={reduceMotion ? 0 : 180}
          timingFunction={isOverlayOpen ? "ease-out" : "ease-in"}
        >
          {(styles) =>
            renderedAgentId ? (
              <div
                className={S.overlay}
                style={styles}
                data-testid="metabot-expanded-chat"
              >
                <ErrorBoundary errorComponent={() => null}>
                  <MetabotConversationView
                    agentId={renderedAgentId}
                    isNewConversation={false}
                    alwaysShowConversation
                    onCollapse={() =>
                      dispatch(
                        collapseConversation({ agentId: renderedAgentId }),
                      )
                    }
                  />
                </ErrorBoundary>
              </div>
            ) : (
              <span />
            )
          }
        </Transition>
      </div>
      {showChrome && <MetabotBar />}
    </div>
  );
}
