/**
 * Wrap an enterprise plugin implementation behind a runtime feature gate.
 *
 * The build decides which module is bundled; this decides, at runtime, whether
 * the enterprise behaviour is active. While `isEnabled()` is true every member
 * resolves to `enabled`; otherwise every member resolves to `disabled` (the OSS
 * default). `isEnabled()` is read lazily on each access — it cannot be read at
 * module-eval time because token features load after the bundle evaluates.
 *
 * This replaces per-member gating: components, hooks and plain functions all go
 * through the one gate, so the enterprise implementation stays a plain object.
 */
export function gatedPlugin<T extends object>(
  isEnabled: () => boolean,
  enabled: T,
  disabled: T,
): T {
  return new Proxy(enabled, {
    get(enabledTarget, property) {
      return Reflect.get(isEnabled() ? enabledTarget : disabled, property);
    },
  });
}
