import {
  CREATE_ELEMENT,
  CREATE_ELEMENT_NS,
} from "metabase/utils/scripts-sandbox/distortions-dom-mutate";

const isStyleTag = (tag: string) => tag.toLowerCase() === "style";

function isStyleQualifiedName(qualifiedName: string) {
  const localName = qualifiedName.includes(":")
    ? qualifiedName.slice(qualifiedName.indexOf(":") + 1)
    : qualifiedName;

  return isStyleTag(localName);
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
      // Data-app bundles inline imported CSS with
      // `vite-plugin-css-injected-by-js`, which creates a `<style>` tag at
      // runtime. Allow only that tag while keeping the shared dangerous-tag
      // blocklist for `script` and other DOM creation.
      if (isStyleTag(tag)) {
        return CREATE_ELEMENT.call(this, tag, options);
      }

      return sharedCreateElement.call(this, tag, options);
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
      if (isStyleQualifiedName(qualifiedName)) {
        // Same exception as `createElement("style")`, but for namespaced
        // creation paths.
        return CREATE_ELEMENT_NS.call(
          this,
          namespaceURI,
          qualifiedName,
          options,
        );
      }

      return sharedCreateElementNS.call(
        this,
        namespaceURI,
        qualifiedName,
        options,
      );
    };
  }

  return null;
}
