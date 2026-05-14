import { useEffect, useRef, useState } from "react";

import {
  ParametersPlayground,
  useControlledParametersPlaygroundState,
} from "embedding-sdk-bundle/test/ParametersPlayground";
import type { ParameterChangePayload } from "embedding-sdk-bundle/types/dashboard";
import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
import { SegmentedControl, Stack, Text } from "metabase/ui";

import type { MetabaseDashboardElement } from "./embed";

type Mode = "controlled" | "uncontrolled";

const INSTANCE_URL =
  (window as any).METABASE_INSTANCE_URL || "http://localhost:3000";

const DASHBOARD_ID = (window as any).DASHBOARD_ID || 1;

// Module-level init: the custom element reads `window.metabaseConfig`
// in `connectedCallback`, so `window.metabaseConfig` must already be set by the time the
// element mounts. `useMemo` / `useEffect` aren't suitable — `useMemo`
// is for memoization (not side effects) and `useEffect` runs after
// children commit, too late for a child custom element's mount.
(window as any).metabaseConfig = {
  instanceUrl: INSTANCE_URL,
  useExistingUserSession: true,
};

const ControlledParametersEmbedJsPlayground = () => {
  const elementRef = useRef<InstanceType<
    typeof MetabaseDashboardElement
  > | null>(null);

  const [ready, setReady] = useState(false);
  const [readValue, setReadValue] = useState<ParameterValues | null>(null);
  const [mode, setMode] = useState<Mode>("controlled");

  const playground = useControlledParametersPlaygroundState({
    onLocalChange: (next) => {
      if (mode === "controlled" && elementRef.current) {
        elementRef.current.parameters = next;
      }
    },
  });

  useEffect(() => {
    const element = elementRef.current;

    if (!element) {
      return;
    }

    const onReady = () => {
      setReady(true);
      playground.pushLog("ready");
    };

    element.addEventListener("ready", onReady);

    let onParametersChange: ((event: Event) => void) | null = null;
    if (mode === "controlled") {
      onParametersChange = (event: Event) => {
        const detail = (event as CustomEvent<ParameterChangePayload>).detail;

        playground.handleParametersChange(detail);
      };

      element.addEventListener("parameters-change", onParametersChange);
    }

    return () => {
      element.removeEventListener("ready", onReady);

      if (onParametersChange) {
        element.removeEventListener("parameters-change", onParametersChange);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <ParametersPlayground
      {...playground}
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
      onGetNow={() => {
        const values: ParameterValues | undefined =
          elementRef.current?.parameters;
        setReadValue(values ?? null);
        playground.pushLog(`el.parameters → ${JSON.stringify(values)}`);
      }}
      readValue={readValue}
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
