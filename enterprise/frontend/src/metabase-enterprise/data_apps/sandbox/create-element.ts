import {
  BLOCKED_TAGS,
  CREATE_ELEMENT,
  CREATE_ELEMENT_NS,
} from "metabase/utils/scripts-sandbox/distortions-dom-mutate";

// DISCOVERY MODE (temporary): block only the hard realm-creation / code-exec
// vectors, allow everything else so a full SDK render completes, and log every
// tag the shared blocklist would normally forbid — so we can build a tight,
// security-vetted data-app allowlist from what the SDK *actually* creates
// instead of guessing. (custom-viz is unaffected — it uses the shared blocklist
// directly.)
const HARD_BLOCKED = new Set(["script", "iframe", "object", "embed", "frame"]);

const loggedTags = new Set<string>();

function classify(tag: string): "block" | "log" | "allow" {
  const lower = tag.toLowerCase();
  if (HARD_BLOCKED.has(lower)) {
    return "block";
  }
  if (BLOCKED_TAGS.has(lower)) {
    return "log";
  }
  return "allow";
}

function logDiscovery(tag: string) {
  const lower = tag.toLowerCase();

  if (!loggedTags.has(lower)) {
    loggedTags.add(lower);
    console.warn(`[data-app] SDK-needed tag (normally blocked): ${lower}`);
  }
}

function localNameOf(qualifiedName: string) {
  return qualifiedName.includes(":")
    ? qualifiedName.slice(qualifiedName.indexOf(":") + 1)
    : qualifiedName;
}

/** The shared sandbox distortion callback, as the membrane types it. */
type SharedDistortion = (value: object) => object;

export function makeCreateElementDistortion(
  value: typeof CREATE_ELEMENT,
  shared: SharedDistortion,
): typeof CREATE_ELEMENT;
export function makeCreateElementDistortion(
  value: typeof CREATE_ELEMENT_NS,
  shared: SharedDistortion,
): typeof CREATE_ELEMENT_NS;
export function makeCreateElementDistortion(
  value: object,
  shared: SharedDistortion,
): object | null;
export function makeCreateElementDistortion(
  value: object,
  shared: SharedDistortion,
): object | null {
  if (value === CREATE_ELEMENT) {
    // A distortion callback is typed `object -> object` (the membrane erases the
    // call signature), so restore the signature of the ref it stands in for.
    const sharedCreateElement = shared(value) as typeof CREATE_ELEMENT;

    return function createElement(
      this: Document,
      tag: string,
      options?: ElementCreationOptions,
    ) {
      const verdict = classify(tag);
      if (verdict === "block") {
        return sharedCreateElement.call(this, tag, options);
      }
      if (verdict === "log") {
        logDiscovery(tag);
      }
      return CREATE_ELEMENT.call(this, tag, options);
    };
  }

  if (value === CREATE_ELEMENT_NS) {
    // Same signature restoration as above: `shared` hands back a drop-in
    // replacement for `createElementNS`, typed only as `object`.
    const sharedCreateElementNS = shared(value) as typeof CREATE_ELEMENT_NS;

    return function createElementNS(
      this: Document,
      namespaceURI: string | null,
      qualifiedName: string,
      options?: ElementCreationOptions,
    ) {
      const verdict = classify(localNameOf(qualifiedName));
      if (verdict === "block") {
        return sharedCreateElementNS.call(
          this,
          namespaceURI,
          qualifiedName,
          options,
        );
      }
      if (verdict === "log") {
        logDiscovery(localNameOf(qualifiedName));
      }
      return CREATE_ELEMENT_NS.call(this, namespaceURI, qualifiedName, options);
    };
  }

  return null;
}
