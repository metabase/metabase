import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { useIsOldDemoVersion } from "metabase/common/hooks/use-is-old-demo-version";
import { matchPath, subscribeLocation } from "metabase/router";
import { getBasename } from "metabase/utils/basename";

import S from "./OldVersionOverlay.module.css";

const CORNERS = ["topLeft", "topRight", "bottomLeft", "bottomRight"] as const;
const WEB_RINGS = [0.16, 0.32, 0.48, 0.64, 0.8, 1];
const getPathname = () => window.location.pathname;

function Cobweb({ corner }: { corner: (typeof CORNERS)[number] }) {
  return (
    <svg
      className={`${S.web} ${S[corner]}`}
      viewBox="0 0 200 200"
      fill="none"
      focusable="false"
    >
      <path d="M0 0H196M0 0 190 51M0 0 170 98M0 0 139 139M0 0 98 170M0 0 51 190M0 0V196" />
      {WEB_RINGS.map((scale) => (
        <path
          key={scale}
          transform={`scale(${scale})`}
          vectorEffect="non-scaling-stroke"
          d="M192 0Q170 20 185 50Q150 65 166 96Q127 108 136 136Q108 127 96 166Q65 150 50 185Q20 170 0 192"
        />
      ))}
    </svg>
  );
}

export function OldVersionOverlay() {
  const isOldBuild = useIsOldDemoVersion();
  // This sits outside RouterProvider so it also covers global portals and app entries.
  const pathname = useSyncExternalStore(subscribeLocation, getPathname);
  const isUpdatePage = matchPath(`${getBasename()}/update`, pathname) != null;

  if (!isOldBuild || isUpdatePage) {
    return null;
  }

  return createPortal(
    <div className={S.overlay} aria-hidden="true">
      {CORNERS.map((corner) => (
        <Cobweb key={corner} corner={corner} />
      ))}
    </div>,
    document.body,
  );
}
