import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import type {
  CustomVisualization,
  CustomVisualizationProps,
  MountHandle,
} from "./types";

export type CustomVisualizationOpts<TSettings extends Record<string, unknown>> =
  Omit<CustomVisualization<TSettings>, "mount"> & {
    Component: React.ComponentType<CustomVisualizationProps<TSettings>>;
  };

class PluginErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[plugin] visualization render failed:", error);
  }

  render() {
    if (this.state.error) {
      /* eslint-disable metabase/no-color-literals, i18next/no-literal-string */
      return (
        <div
          style={{
            padding: 8,
            color: "var(--mb-color-error, #d33)",
            fontSize: 12,
          }}
        >
          Visualization failed to render.
        </div>
      );
      /* eslint-enable metabase/no-color-literals, i18next/no-literal-string */
    }
    return this.props.children;
  }
}

export function createCustomVisualization<
  TSettings extends Record<string, unknown>,
>(opts: CustomVisualizationOpts<TSettings>): CustomVisualization<TSettings> {
  const { Component, ...rest } = opts;

  return {
    ...rest,
    mount(
      container: Element,
      initial: CustomVisualizationProps<TSettings>,
    ): MountHandle<CustomVisualizationProps<TSettings>> {
      const root = createRoot(container);
      // Plain object with the same shape as useRef — useRef only works inside
      // a React component, but this closure is not a component.
      const setPropsRef: {
        current: ((p: CustomVisualizationProps<TSettings>) => void) | null;
      } = { current: null };
      let pendingProps: CustomVisualizationProps<TSettings> | undefined;

      function Bridge({
        first,
      }: {
        first: CustomVisualizationProps<TSettings>;
      }) {
        // `first` is only the useState initializer; subsequent prop updates
        // flow via the ref-captured setter, not by re-rendering Bridge with
        // a new `first`. Do not add a useEffect that calls setProps(first).
        const [props, setProps] = useState(first);
        setPropsRef.current = setProps;

        // Drain any update() calls that arrived before the first commit.
        useEffect(() => {
          if (pendingProps !== undefined) {
            setProps(pendingProps);
            pendingProps = undefined;
          }
        }, []);

        return (
          <PluginErrorBoundary>
            <Component {...props} />
          </PluginErrorBoundary>
        );
      }

      root.render(<Bridge first={initial} />);

      return {
        update(next) {
          if (setPropsRef.current) {
            setPropsRef.current(next);
          } else {
            pendingProps = next;
          }
        },
        unmount: () => root.unmount(),
      };
    },
  };
}
