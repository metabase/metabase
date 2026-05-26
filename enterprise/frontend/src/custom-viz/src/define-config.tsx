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
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    const { message, stack } = error;
    console.error(`[plugin] visualization render failed: ${message}\n${stack}`);
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
  const { VisualizationComponent, ...rest } = opts;

  return {
    ...rest,
    VisualizationComponent,
    mount(
      container: Element,
      initial: CustomVisualizationProps<TSettings>,
    ): CustomVisualizationMountHandle<CustomVisualizationProps<TSettings>> {
      const root = createRoot(container);

      const render = (props: CustomVisualizationProps<TSettings>) => {
        root.render(
          <PluginErrorBoundary>
            <VisualizationComponent {...props} />
          </PluginErrorBoundary>,
        );
      };

      render(initial);

      return {
        update: render,
        unmount: () => root.unmount(),
      };
    },
  };
}
