import DOMPurify from "dompurify";

import { localName } from "metabase/utils/scripts-sandbox/distortions-dom-mutate";

/**
 * Blocks realm-creating elements for every creator in the data-app document: guest
 * code can hand host React a plain element description (`react.element` is a shared
 * symbol) that skips the gated guest `createElement`. So both host channels are
 * guarded — `createElement`/`createElementNS` (blocked) and `innerHTML`/`outerHTML`/
 * `insertAdjacentHTML` (realm tags stripped). Install AFTER Near-Membrane's realm iframe exists.
 *
 * Used as a module singleton (one realm per data-app bundle); `install` is
 * idempotent per document.
 */
class HostRealmElementGuard {
  // Elements that open a new same-origin browsing context — a realm the guest could
  // reach for an unwrapped `fetch`. `<script>` is excluded on purpose: the SDK and
  // bundler create script elements host-side, and script execution is already gated
  // by the data-app CSP `script-src`. These are the realm-creating tags that CSP
  // `frame-src` can't cover (srcless `about:blank`).
  private static readonly REALM_CREATING_TAGS = new Set([
    "iframe",
    "frame",
    "frameset",
    "object",
    "embed",
  ]);

  private static readonly HOST_PURIFY_CONFIG = {
    FORBID_TAGS: Array.from(HostRealmElementGuard.REALM_CREATING_TAGS),
  };

  // Raised only around the trusted chart PNG export (html2canvas needs a transient
  // same-origin <iframe>). Not endowed, so the guest can't reach it — and any realm
  // that iframe opens still collapses to the gated realm via the distortion.
  private iframeGrantDepth = 0;

  // DOMPurify parses by assigning `innerHTML` on a detached node, re-entering the
  // setters we patch; pass the raw value through during that internal parse.
  private isSanitizing = false;

  private readonly installed = new WeakSet<Document>();

  withIframeGrant = async <T>(callback: () => Promise<T>): Promise<T> => {
    this.iframeGrantDepth += 1;
    try {
      return await callback();
    } finally {
      this.iframeGrantDepth -= 1;
    }
  };

  install(targetWindow: Window): void {
    const { document } = targetWindow;

    if (this.installed.has(document)) {
      return;
    }

    this.installed.add(document);

    this.guardCreateElement(document);
    // `Element`/`ShadowRoot` are this realm's own globals — the module loads in the
    // same realm as `targetWindow` (the data-app document).
    this.guardMarkupInsertion();
  }

  private isBlocked(tag: string): boolean {
    const name = localName(tag).toLowerCase();

    if (name === "iframe" && this.iframeGrantDepth > 0) {
      return false;
    }

    return HostRealmElementGuard.REALM_CREATING_TAGS.has(name);
  }

  private sanitizeHostHtml(html: unknown): string {
    const htmlString = String(html);
    const isMarkup = htmlString.includes("<");

    if (this.isSanitizing || !isMarkup) {
      return htmlString;
    }

    this.isSanitizing = true;
    try {
      return DOMPurify.sanitize(
        htmlString,
        HostRealmElementGuard.HOST_PURIFY_CONFIG,
      );
    } finally {
      this.isSanitizing = false;
    }
  }

  private guardCreateElement(document: Document): void {
    const createElement = document.createElement.bind(document);
    const createElementNS = document.createElementNS.bind(document);

    const rejectIfBlocked = (tag: string, api: string) => {
      if (this.isBlocked(tag)) {
        throw new Error(`[data-app] blocked host ${api}: ${tag}`);
      }
    };

    const guardedCreate = (tag: string, options?: ElementCreationOptions) => {
      rejectIfBlocked(tag, "createElement");
      return createElement(tag, options);
    };

    const guardedCreateNS = (
      namespaceURI: string | null,
      qualifiedName: string,
      options?: ElementCreationOptions,
    ) => {
      rejectIfBlocked(qualifiedName, "createElementNS");
      return createElementNS(namespaceURI, qualifiedName, options);
    };

    // The natives carry tag-name overloads the guards don't reproduce; assert back to
    // the native property type so the patched document still satisfies `Document`.
    document.createElement = guardedCreate as Document["createElement"];
    // Same overload-preserving assertion as `createElement`.
    document.createElementNS = guardedCreateNS as Document["createElementNS"];
  }

  private guardMarkupInsertion(): void {
    // Bound to the instance because the patched setter's `this` is the element.
    const sanitize = (html: unknown) => this.sanitizeHostHtml(html);

    const htmlSetterOwners = [
      { proto: Element.prototype, keys: ["innerHTML", "outerHTML"] },
      { proto: ShadowRoot.prototype, keys: ["innerHTML"] },
    ];

    for (const { proto, keys } of htmlSetterOwners) {
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(proto, key);
        const originalSet = descriptor?.set;

        if (!descriptor || !originalSet) {
          continue;
        }

        Object.defineProperty(proto, key, {
          ...descriptor,
          set(this: Element | ShadowRoot, value: unknown) {
            originalSet.call(this, sanitize(value));
          },
        });
      }
    }

    const { insertAdjacentHTML } = Element.prototype;

    Element.prototype.insertAdjacentHTML = function (
      this: Element,
      position: InsertPosition,
      html: string,
    ) {
      return insertAdjacentHTML.call(this, position, sanitize(html));
    };
  }
}

export const hostRealmElementGuard = new HostRealmElementGuard();
