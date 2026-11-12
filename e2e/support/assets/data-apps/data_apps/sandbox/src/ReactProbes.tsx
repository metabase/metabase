import { createElement, useState } from "react";
import type { MutableRefObject } from "react";

import { BoundaryReporter } from "./BoundaryReporter";
import type { IsolationTestEnv, ReactMode, ReactProbe, Report } from "./types";
import { reportRealm } from "./utils";

export const REACT_PROBES: ReactProbe[] = [
  {
    id: "react-about-blank",
    label: "React iframe about:blank",
    mode: "react-iframe-about-blank",
  },
  { id: "react-src", label: "React iframe src", mode: "react-iframe-src" },
  {
    id: "react-srcdoc",
    label: "React iframe srcdoc",
    mode: "react-iframe-srcdoc",
  },
  {
    id: "inner-html",
    label: "iframe via dangerouslySetInnerHTML",
    mode: "react-inner-html",
  },
  {
    id: "custom-element",
    label: "custom element upgrade callback",
    mode: "react-custom-element",
  },
];

// Registered once; its upgrade callback fires from host React but runs as a
// guest closure, so `window` here is the gated guest realm.
export const useProbeCustomElement = (report: Report) => {
  useState(() => {
    const tag = "x-isolation-probe";

    if (!customElements.get(tag)) {
      customElements.define(
        tag,
        class extends HTMLElement {
          connectedCallback() {
            reportRealm(report, window, "custom-element");
          }
        },
      );
    }

    return null;
  });
};

type ReactProbeHostProps = {
  mode: ReactMode | null;
  env: IsolationTestEnv;
  report: Report;
  firedRef: MutableRefObject<boolean>;
};

export function ReactProbeHost({
  mode,
  env,
  report,
  firedRef,
}: ReactProbeHostProps) {
  return (
    // Keyed on the mode so each probe gets a fresh boundary.
    <BoundaryReporter key={mode ?? "none"} onResult={report}>
      {mode === "react-iframe-about-blank" && (
        <iframe
          title="isolation-target"
          ref={(element) => {
            if (element && !firedRef.current) {
              firedRef.current = true;
              reportRealm(report, element.contentWindow, "react-about-blank");
            }
          }}
          style={{ display: "none" }}
        />
      )}

      {mode === "react-iframe-src" && (
        <iframe
          title="isolation-target"
          src={`${env.instanceUrl}/`}
          onLoad={(e) =>
            reportRealm(report, e.currentTarget.contentWindow, "react-src")
          }
          style={{ display: "none" }}
        />
      )}

      {mode === "react-iframe-srcdoc" && (
        <iframe
          title="isolation-target"
          srcDoc={'<!doctype html><meta charset="utf-8">'}
          onLoad={(e) =>
            reportRealm(report, e.currentTarget.contentWindow, "react-srcdoc")
          }
          style={{ display: "none" }}
        />
      )}

      {/* Markup, not a tag: the parser inserts the iframe, bypassing
          `createElement`; the host markup guard must sanitize it. */}
      {mode === "react-inner-html" && (
        <div
          ref={(host) => {
            if (!host || firedRef.current) {
              return;
            }
            firedRef.current = true;
            const iframe = host.querySelector("iframe");
            reportRealm(
              report,
              iframe ? iframe.contentWindow : null,
              "inner-html",
            );
          }}
          dangerouslySetInnerHTML={{
            __html: `<iframe style="display:none"></iframe>`,
          }}
        />
      )}
      {mode === "react-custom-element" && createElement("x-isolation-probe")}
    </BoundaryReporter>
  );
}
