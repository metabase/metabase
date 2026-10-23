import type { ComponentType, ReactNode } from "react";
import { Component } from "react";
import { createRoot } from "react-dom/client";

import type {
  BaseVisualizationSettings,
  CustomVisualization,
  CustomVisualizationMountHandle,
  CustomVisualizationProps,
} from "./types";

export type CustomVisualizationOpts<
  TSettings extends BaseVisualizationSettings,
> = Omit<CustomVisualization<TSettings>, "mount"> & {
  VisualizationComponent: ComponentType<CustomVisualizationProps<TSettings>>;
};

type PluginErrorBoundaryProps = {
  children: ReactNode;
  label: string;
  updateId: number;
};

class PluginErrorBoundary extends Component<
  PluginErrorBoundaryProps,
  { error: Error | null; updateId: number }
> {
  state: { error: Error | null; updateId: number } = {
    error: null,
    updateId: this.props.updateId,
  };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  // Reset on the next update so one bad render doesn't blank the plugin forever.
  static getDerivedStateFromProps(
    props: PluginErrorBoundaryProps,
    state: { error: Error | null; updateId: number },
  ) {
    if (props.updateId === state.updateId) {
      return null;
    }
    return { error: null, updateId: props.updateId };
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

export function defineConfig<TSettings extends BaseVisualizationSettings>(
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
      let updateId = 0;

      const render = (props: P) => {
        root.render(
          <PluginErrorBoundary
            label={Component.displayName ?? Component.name ?? "plugin"}
            updateId={updateId++}
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
