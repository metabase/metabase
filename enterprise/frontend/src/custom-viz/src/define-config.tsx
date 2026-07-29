import type { ComponentType, ReactNode } from "react";
import { Component } from "react";
import { createRoot } from "react-dom/client";

import type {
  CustomVisualization,
  CustomVisualizationMountHandle,
  CustomVisualizationProps,
} from "./types";

export type CustomVisualizationOpts<TSettings extends Record<string, unknown>> =
  Omit<CustomVisualization<TSettings>, "mount"> & {
    VisualizationComponent: ComponentType<CustomVisualizationProps<TSettings>>;
  };

class PluginErrorBoundary extends Component<
  { children: ReactNode; label: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    const { message, stack } = error;
    console.error(
      `[plugin] ${this.props.label} render failed: ${message}\n${stack}`,
    );
  }

  render() {
    if (this.state.error) {
      return null;
    }
    return this.props.children;
  }
}

export function defineConfig<TSettings extends Record<string, unknown>>(
  opts: CustomVisualizationOpts<TSettings>,
): CustomVisualization<TSettings> {
  return {
    ...opts,
    mount<P extends object>(
      Component: ComponentType<P>,
      container: Element,
      initialProps: P,
    ): CustomVisualizationMountHandle<P> {
      const root = createRoot(container);

      const render = (props: P) => {
        root.render(
          <PluginErrorBoundary
            label={Component.displayName ?? Component.name ?? "plugin"}
          >
            <Component {...props} />
          </PluginErrorBoundary>,
        );
      };

      render(initialProps);

      return {
        update: render,
        unmount: () => root.unmount(),
      };
    },
  };
}
