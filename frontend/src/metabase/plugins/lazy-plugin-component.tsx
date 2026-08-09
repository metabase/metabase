import {
  type ComponentType,
  type ReactNode,
  Suspense,
  createElement,
  lazy,
} from "react";

/**
 * A plugin's component slot, fetched the first time something renders it.
 *
 * `initializePlugins()` runs before the routes are built, so every plugin's
 * `index` module and everything it imports is in the initial bundle whether the
 * feature is licensed or not. A slot filled with this holds only a promise until
 * the slot is actually rendered.
 *
 * Two slots are not candidates for this, and neither is detectable from here:
 *
 *  - one that wraps `children`, such as a context provider. `Suspense` replaces
 *    the whole subtree with the fallback, so deferring the wrapper hides
 *    everything inside it.
 *  - one whose OSS default is a working component rather than
 *    `PluginPlaceholder`, since the enterprise build would then be slower to
 *    reach the same result the OSS build has immediately.
 *
 * `fallback` defaults to nothing, which is right for the small inline slots that
 * make up most of the registry: an icon, a badge, a menu item. A spinner in
 * their place reads as breakage. Pass one for a slot that owns a whole panel.
 */
export function lazyPluginComponent<Props extends object>(
  load: () => Promise<ComponentType<Props>>,
  fallback: ReactNode = null,
): ComponentType<Props> {
  // `lazy` describes its props through `ComponentPropsWithRef`, which TypeScript
  // cannot resolve while `Props` is still a type variable, so neither a JSX
  // spread nor `createElement` type-checks against it. What it wraps is a
  // `ComponentType<Props>` by construction, which is what the cast asserts.
  const Loaded = lazy(() =>
    load().then((Component) => ({ default: Component })),
  ) as unknown as ComponentType<Props>;

  return function LazyPluginComponent(props: Props) {
    return (
      <Suspense fallback={fallback}>{createElement(Loaded, props)}</Suspense>
    );
  };
}
