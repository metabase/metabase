import { type CSSProperties, useEffect, useRef } from "react";

import {
  DEFAULT_BOUNDED_HEIGHT,
  DEFAULT_BOUNDED_WIDTH,
} from "embedding-sdk-package/constants/bounded-size";
import { arePropsEquivalent } from "embedding-sdk-package/lib/private/are-props-equivalent";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

export type DataAppSdkMountHandle = {
  update: (componentProps: Record<string, unknown>) => void;
  unmount: () => void;
};

export type DataAppSdkMount = (
  container: HTMLElement,
  ComponentProvider: unknown,
  providerProps: Record<string, unknown>,
  Component: unknown,
  componentProps: Record<string, unknown>,
) => DataAppSdkMountHandle;

export const getDataAppSdkMount = (): DataAppSdkMount | undefined => {
  // The bridge is an untyped ad-hoc global, endowed only inside a data-app sandbox.
  const win = getWindow() as unknown as {
    __MB_DATA_APP_SDK_MOUNT__?: DataAppSdkMount;
  } | null;

  return win?.__MB_DATA_APP_SDK_MOUNT__;
};

/**
 * Renders the host `<ComponentProvider><Component/>` subtree into a container
 * this (guest) component provides, using the host runtime's mediated-mount
 * bridge — so the SDK component runs on host React inside the guest app's DOM.
 *
 * Unlike a JSX child, this bridge re-renders imperatively: React can't reconcile
 * across the two roots, so every guest render would otherwise push a fresh render
 * into the host root — that's why here is the prop comparison before each update.
 */
export const DataAppMediatedMount = ({
  mount,
  ComponentProvider,
  providerProps,
  Component,
  componentProps,
  height,
  width,
}: {
  mount: DataAppSdkMount;
  ComponentProvider: unknown;
  providerProps: Record<string, unknown>;
  Component: unknown;
  componentProps: Record<string, unknown>;
  height?: CSSProperties["height"];
  width?: CSSProperties["width"];
}) => {
  const handleRef = useRef<DataAppSdkMountHandle | null>(null);
  const latestComponentProps = useRef(componentProps);
  latestComponentProps.current = componentProps;
  // The props the mediated root was last rendered with, so a re-render that
  // changed nothing meaningful doesn't restart the SDK's query.
  const renderedComponentProps = useRef<Record<string, unknown> | null>(null);

  useEffect(() => {
    const renderedProps = renderedComponentProps.current;

    // The guest re-creates prop objects on every render — `card={{ query }}`, and
    // inline `visualizationSettings={{ … }}` nested inside it — so an identity
    // check would report a change every time. Each reported change re-renders the
    // mediated root, and the SDK reads a new `card` identity as a new question,
    // restarting its dataset query and aborting the in-flight one; the component
    // is then left with no result at all.
    if (renderedProps && arePropsEquivalent(renderedProps, componentProps)) {
      return;
    }

    renderedComponentProps.current = componentProps;
    handleRef.current?.update(componentProps);
  }, [componentProps]);

  useEffect(
    () => () => {
      handleRef.current?.unmount();
      handleRef.current = null;
    },
    [],
  );

  return (
    <div
      style={{
        height: height ?? DEFAULT_BOUNDED_HEIGHT,
        width: width ?? DEFAULT_BOUNDED_WIDTH,
      }}
      ref={(element) => {
        if (element && !handleRef.current) {
          renderedComponentProps.current = latestComponentProps.current;
          handleRef.current = mount(
            element,
            ComponentProvider,
            providerProps,
            Component,
            latestComponentProps.current,
          );
        }
      }}
    />
  );
};
