import { useEffect, useMemo, useRef, useState } from "react";

import {
  ParametersPlayground,
  formatLogEntry,
} from "embedding-sdk-bundle/test/ParametersPlayground";
import type { DashboardParameterChangePayload } from "embedding-sdk-bundle/types/dashboard";
import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
import { SegmentedControl, Stack, Text } from "metabase/ui";

import type { MetabaseDashboardElement } from "./embed";

// Side-effects: registers <metabase-dashboard> and friends.
import "./embed";

type Mode = "controlled" | "uncontrolled";

const INSTANCE_URL =
  (window as any).METABASE_INSTANCE_URL || "http://localhost:3000";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || 1;

const ControlledParametersEmbedJsPlayground = () => {
  const elementRef = useRef<MetabaseDashboardElement | null>(null);

  const [ready, setReady] = useState(false);
  const [parameters, setParameters] = useState<ParameterValues>({});
  const [readValue, setReadValue] = useState<ParameterValues | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [defaultParameters, setDefaultParameters] =
    useState<ParameterValues | null>(null);
  const [lastUsedParameters, setLastUsedParameters] =
    useState<ParameterValues | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("controlled");

  const pushLog = (entry: string) =>
    setLog((prev) => [formatLogEntry(entry), ...prev]);

  // Initialize metabaseConfig before the element mounts.
  useMemo(() => {
    (window as any).metabaseConfig = {
      instanceUrl: INSTANCE_URL,
      useExistingUserSession: true,
    };
  }, []);

  useEffect(() => {
    const el = elementRef.current;
    if (!el) {
      return;
    }

    const onReady = () => {
      setReady(true);
      pushLog("ready");
    };
    el.addEventListener("ready", onReady);

    // Only attach the change listener in controlled mode — that's the
    // signal that the host wants to mirror iframe state into its own
    // parent state and (optionally) push updates back. In uncontrolled
    // mode the host doesn't observe; user edits in the widget stay
    // inside the iframe.
    let onParametersChange: ((event: Event) => void) | null = null;
    if (mode === "controlled") {
      onParametersChange = (event: Event) => {
        const detail = (event as CustomEvent<DashboardParameterChangePayload>)
          .detail;
        setParameters(detail.parameters);
        setSource(detail.source);
        setDefaultParameters(detail.defaultParameters);
        setLastUsedParameters(detail.lastUsedParameters);
        pushLog(
          `parameters-change [${detail.source}] parameters=${JSON.stringify(detail.parameters)}`,
        );
      };
      el.addEventListener("parameters-change", onParametersChange);
    }

    return () => {
      el.removeEventListener("ready", onReady);
      if (onParametersChange) {
        el.removeEventListener("parameters-change", onParametersChange);
      }
    };
  }, [mode]);

  // Push a slug-keyed patch by merging it into the host-tracked state and
  // assigning the merged object to the controlled `parameters` property.
  // In uncontrolled mode this is a no-op: the host's role is to set the
  // initial seed via the attribute and walk away.
  const pushPatch = (patch: ParameterValues, description: string) => {
    if (mode === "uncontrolled") {
      pushLog(
        `${description} — ignored (uncontrolled mode: host shouldn't push)`,
      );
      return;
    }

    setParameters((prev) => {
      const next = { ...prev, ...patch };
      if (elementRef.current) {
        elementRef.current.parameters = next;
      }
      return next;
    });
    pushLog(description);
  };

  return (
    <ParametersPlayground
      title="Embed.js — parameters playground"
      description={
        <Stack gap="xs">
          <Text size="sm" c="text-secondary">
            Initial seed comes from the <code>initial-parameters</code>{" "}
            attribute (set once at mount).
            <br />
            <b>Controlled</b>: <code>el.parameters = ...</code> push +{" "}
            <code>parameters-change</code> listener attached. Parent state
            mirrors iframe state.
            <br />
            <b>Uncontrolled</b>: no listener; user edits in the widget stay
            inside the iframe and don&apos;t reach parent state. Push controls
            are no-ops in this mode.
            <br />
            Dashboard runs inside the iframe at {INSTANCE_URL} (logged-in
            session required).
          </Text>
          <SegmentedControl
            size="xs"
            value={mode}
            onChange={(value) => setMode(value as Mode)}
            data={[
              { value: "controlled", label: "controlled" },
              { value: "uncontrolled", label: "uncontrolled" },
            ]}
          />
        </Stack>
      }
      ready={ready}
      parameters={parameters}
      log={log}
      onSetOne={(slug, value) =>
        pushPatch(
          { [slug]: value },
          `el.parameters[${slug}] = ${JSON.stringify(value)}`,
        )
      }
      onClearOne={(slug) =>
        pushPatch({ [slug]: null }, `el.parameters[${slug}] = null`)
      }
      onClearAll={() => {
        const knownKeys = Object.keys(parameters);
        if (knownKeys.length === 0) {
          pushLog("clear all — no known keys yet");
          return;
        }
        const patch: ParameterValues = {};
        for (const key of knownKeys) {
          patch[key] = null;
        }
        pushPatch(patch, `el.parameters = ${JSON.stringify(patch)}`);
      }}
      onGetNow={() => {
        const values: ParameterValues | undefined =
          elementRef.current?.parameters;
        setReadValue(values ?? null);
        pushLog(`el.parameters → ${JSON.stringify(values)}`);
      }}
      readValue={readValue}
      source={source}
      defaultParameters={defaultParameters}
      lastUsedParameters={lastUsedParameters}
      dashboard={
        // @ts-expect-error - unknown custom element
        <metabase-dashboard
          ref={elementRef}
          dashboard-id={DASHBOARD_ID}
          parameters={JSON.stringify({ product_category: "Foo" })}
          style={{ width: "100%", height: "100%" }}
        />
      }
    />
  );
};

export default {
  title: "EmbedJs/Dashboard",
  parameters: { layout: "fullscreen" },
};

export const ControlledParameters = {
  render: () => <ControlledParametersEmbedJsPlayground />,
};
