import cx from "classnames";
import type { PointerEvent } from "react";
import { useRef, useState } from "react";
import { t } from "ttag";

import { ActionIcon, Icon, Portal, Tabs } from "metabase/ui";
import type { DashboardCard } from "metabase-types/api";

import S from "./DashCardInspector.module.css";
import { DashCardInspectorSettings } from "./DashCardInspectorSettings";

interface Point {
  x: number;
  y: number;
}

interface DashCardInspectorProps {
  /** The selected card. The panel is hidden when there is none. */
  dashcard: DashboardCard | undefined;
  onClose: () => void;
}

type InspectorTab = "settings" | "query";

function isInspectorTab(value: string | null): value is InspectorTab {
  return value === "settings" || value === "query";
}

/** How much of the panel always stays inside the window, so it can be dragged back */
const MIN_VISIBLE_PX = 48;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * PROTOTYPE: a floating, draggable panel for the selected dashboard card.
 * It keeps its position while the dashboard stays in editing mode.
 */
export function DashCardInspector({
  dashcard,
  onClose,
}: DashCardInspectorProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // where the pointer grabbed the panel, relative to the panel's top-left corner
  const grabOffsetRef = useRef<Point | null>(null);
  const [position, setPosition] = useState<Point | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [tab, setTab] = useState<InspectorTab>("settings");

  if (!dashcard) {
    return null;
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const isOnButton =
      event.target instanceof Element && event.target.closest("button");
    if (event.button !== 0 || isOnButton || !panelRef.current) {
      return;
    }
    const rect = panelRef.current.getBoundingClientRect();
    grabOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const grabOffset = grabOffsetRef.current;
    if (!grabOffset || !panelRef.current) {
      return;
    }
    const { width } = panelRef.current.getBoundingClientRect();
    setPosition({
      x: clamp(
        event.clientX - grabOffset.x,
        MIN_VISIBLE_PX - width,
        window.innerWidth - MIN_VISIBLE_PX,
      ),
      y: clamp(
        event.clientY - grabOffset.y,
        0,
        window.innerHeight - MIN_VISIBLE_PX,
      ),
    });
  };

  const handlePointerUp = () => {
    grabOffsetRef.current = null;
    setIsDragging(false);
  };

  return (
    <Portal>
      <div
        ref={panelRef}
        className={S.panel}
        style={
          position
            ? { left: position.x, top: position.y, right: "auto" }
            : undefined
        }
        data-testid="dashcard-inspector"
        data-dashcard-inspector
      >
        <div
          className={cx(S.header, { [S.isDragging]: isDragging })}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <span className={S.title}>{getTitle(dashcard)}</span>
          <ActionIcon aria-label={t`Close inspector`} onClick={onClose}>
            <Icon name="close" />
          </ActionIcon>
        </div>
        <Tabs
          className={S.tabs}
          value={tab}
          onChange={(value) => isInspectorTab(value) && setTab(value)}
        >
          <Tabs.List className={S.tabList}>
            <Tabs.Tab value="settings">{t`Settings`}</Tabs.Tab>
            <Tabs.Tab value="query">{t`Query`}</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel className={S.tabPanel} value="settings">
            {/* the key starts the settings from their first section for every card */}
            <DashCardInspectorSettings key={dashcard.id} dashcard={dashcard} />
          </Tabs.Panel>
          <Tabs.Panel className={S.tabPanel} value="query">
            <div className={S.message}>
              {t`Query editing will appear here.`}
            </div>
          </Tabs.Panel>
        </Tabs>
      </div>
    </Portal>
  );
}

function getTitle(dashcard: DashboardCard) {
  return dashcard.card.name ?? t`Card`;
}
