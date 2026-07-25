/**
 * Elements that create a new JS realm or execute code.
 */
const REALM_CREATING_TAGS = new Set([
  "script",
  "iframe",
  "frame",
  "object",
  "embed",
]);

const localNameOf = (qualifiedName: string) =>
  qualifiedName.includes(":")
    ? qualifiedName.slice(qualifiedName.indexOf(":") + 1)
    : qualifiedName;

const isBlocked = (tag: string) =>
  REALM_CREATING_TAGS.has(localNameOf(tag).toLowerCase());

const INSTALLED = new WeakSet<Document>();

export function installHostRealmElementGuard(targetWindow: Window): void {
  const { document } = targetWindow;

  if (INSTALLED.has(document)) {
    return;
  }
  INSTALLED.add(document);

  const createElement = document.createElement.bind(document);
  const createElementNS = document.createElementNS.bind(document);

  const guardedCreate = (tag: string, options?: ElementCreationOptions) => {
    if (isBlocked(tag)) {
      throw new Error(`[data-app] blocked host createElement: ${tag}`);
    }

    return createElement(tag, options);
  };

  const guardedCreateNS = (
    namespaceURI: string | null,
    qualifiedName: string,
    options?: ElementCreationOptions,
  ) => {
    if (isBlocked(qualifiedName)) {
      throw new Error(
        `[data-app] blocked host createElementNS: ${qualifiedName}`,
      );
    }

    return createElementNS(namespaceURI, qualifiedName, options);
  };

  // The natives carry a tag-name overload set the guards don't reproduce; assert
  // the property types so the patched document still satisfies `Document`.
  document.createElement = guardedCreate as Document["createElement"];
  // Same overload-preserving assertion as `createElement` above.
  document.createElementNS = guardedCreateNS as Document["createElementNS"];
}
