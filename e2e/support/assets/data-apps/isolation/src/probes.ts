import type { IsolationTestEnv, Probe, Report } from "./types";
import {
  blobUrl,
  describeError,
  htmlDocIframe,
  reportRealm,
  templateIframe,
  xmlDocIframe,
} from "./utils";

// BFS the endowed object graph for a raw `Api` exposing a provisioning
// endpoint; stop at the reference, never dispatch.
const endowmentApi = (report: Report) => {
  const bundle = (
    window as unknown as {
      METABASE_EMBEDDING_SDK_BUNDLE?: Record<string, unknown>;
    }
  ).METABASE_EMBEDDING_SDK_BUNDLE;

  if (!bundle) {
    report("isolated:no-sdk-bundle");
    return;
  }

  const store =
    typeof bundle.getSdkStore === "function"
      ? (bundle.getSdkStore as () => unknown)()
      : null;

  const seen = new Set<unknown>();
  const queue: unknown[] = [bundle, store];

  for (let i = 0; i < queue.length && i < 5000; i++) {
    const node = queue[i];

    if (
      !node ||
      seen.has(node) ||
      (typeof node !== "object" && typeof node !== "function")
    ) {
      continue;
    }

    seen.add(node);

    const createUser = (
      node as { endpoints?: Record<string, { initiate?: unknown }> }
    ).endpoints?.createUser;

    if (createUser && typeof createUser.initiate === "function") {
      report("reached:endowment-provisioning-endpoint");
      return;
    }

    let keys: string[] = [];

    try {
      keys = Object.keys(node as object).slice(0, 60);
    } catch {
      keys = [];
    }

    for (const key of keys) {
      try {
        queue.push((node as Record<string, unknown>)[key]);
      } catch {
        // getter threw — skip
      }
    }
  }

  report("isolated:no-provisioning-endpoint-in-endowments");
};

// V8 `CallSite[]` from a host-dispatched frame would hand back the real host
// `Function` (→ host `globalThis`, un-gated `fetch`). The guest realm's
// `prepareStackTrace` is a non-configurable accessor that rejects functions.
const stackTraceRealm = (report: Report) => {
  const guestFetch = window.fetch;
  const captureStackTrace = (
    Error as { captureStackTrace?: (o: object) => void }
  ).captureStackTrace;

  if (typeof captureStackTrace !== "function") {
    report("isolated:no-callsite-formatter");
    return;
  }

  const original = Error.prepareStackTrace;
  const formatter = (_err: Error, frames: unknown[]) => frames;

  Error.prepareStackTrace = formatter;

  const installed = Error.prepareStackTrace === formatter;

  const holder: { stack?: unknown } = {};
  captureStackTrace(holder);

  const frames = (Array.isArray(holder.stack) ? holder.stack : []) as Array<{
    getFunction?: () => unknown;
    getThis?: () => unknown;
  }>;

  Error.prepareStackTrace = original;

  if (!installed && frames.length === 0) {
    report("isolated:prepare-stack-trace-gated");
    return;
  }

  for (const frame of frames) {
    let fn: unknown;
    let self: unknown;

    try {
      fn = frame.getFunction?.();
    } catch {
      // strict frame — suppressed
    }

    try {
      self = frame.getThis?.();
    } catch {
      // strict frame — suppressed
    }

    const carrier =
      typeof fn === "function"
        ? (fn as { constructor?: unknown })
        : self && typeof self === "object"
          ? ((self as { constructor?: unknown }).constructor as {
              constructor?: unknown;
            })
          : undefined;

    const FnCtor = carrier?.constructor as
      | ((body: string) => () => unknown)
      | undefined;

    if (typeof FnCtor !== "function") {
      continue;
    }

    try {
      const foreign = FnCtor("return globalThis")() as Window;

      if (foreign && foreign.fetch !== guestFetch) {
        report("reached:stack-trace-realm");
        return;
      }
    } catch {
      // constructor gated in this realm — keep scanning
    }
  }

  report(`reached:call-sites-in-${frames.length}-frames`);
};

export const createProbes = (
  env: IsolationTestEnv,
  report: Report,
): Probe[] => {
  const realm = (win: Window | null | undefined, label: string) =>
    reportRealm(report, win, label);

  const adoptedRealm = (make: () => HTMLIFrameElement, label: string) => {
    const iframe = make();
    document.body.appendChild(document.adoptNode(iframe));

    realm(iframe.contentWindow, label);
  };

  const parsedIframeRealm = (root: ParentNode, label: string) => {
    const iframe = root.querySelector("iframe");

    if (!iframe) {
      report("isolated:no-parsed-iframe");
      return;
    }

    document.body.appendChild(document.adoptNode(iframe));

    realm((iframe as HTMLIFrameElement).contentWindow, label);
  };

  const parentStorageRead = (kind: "localStorage" | "sessionStorage") => {
    const ancestor = window.parent as unknown as Record<string, Storage>;

    if (!ancestor || (ancestor as unknown) === window) {
      report("isolated:parent-is-self");
      return;
    }

    const store = ancestor[kind];

    report(
      store && typeof store.length === "number"
        ? `reached:parent-${kind}-${store.length}-keys`
        : `isolated:no-${kind}`,
    );
  };

  const parentFactoryUse = (kind: "indexedDB" | "caches") => {
    const ancestor = window.parent as unknown as {
      indexedDB: IDBFactory;
      caches: CacheStorage;
    };

    if (!ancestor || (ancestor as unknown) === window) {
      report("isolated:parent-is-self");
      return;
    }

    if (kind === "indexedDB") {
      ancestor.indexedDB.open("isolation-probe");
    } else {
      ancestor.caches.match("/");
    }

    report(`reached:parent-${kind}`);
  };

  return [
    {
      id: "create-element",
      label: "document.createElement about:blank",
      run: () => {
        const iframe = document.createElement("iframe");
        document.body.appendChild(iframe);

        realm(iframe.contentWindow, "create-element");
      },
    },
    {
      id: "function-constructor",
      label: "fetch via Function constructor",
      run: () => {
        const makeFn = function () {}.constructor as (
          ...args: string[]
        ) => () => unknown;
        const fetchFn = makeFn("return fetch")() as typeof fetch;

        report(
          fetchFn && fetchFn !== window.fetch
            ? "reached:function-constructor-fetch"
            : "isolated:function-constructor-gated",
        );
      },
    },
    {
      id: "dom-parser",
      label: "iframe via DOMParser",
      run: () =>
        parsedIframeRealm(
          new DOMParser().parseFromString("<iframe></iframe>", "text/html")
            .body,
          "dom-parser",
        ),
    },
    {
      id: "adopt-html-doc-iframe",
      label: "createHTMLDocument iframe + adoptNode",
      run: () => adoptedRealm(htmlDocIframe, "adopt-html-doc"),
    },
    {
      id: "import-html-doc-iframe",
      label: "createHTMLDocument iframe + importNode",
      run: () => {
        const iframe = document.importNode(htmlDocIframe(), true);
        document.body.appendChild(iframe);

        realm(iframe.contentWindow, "import-html-doc");
      },
    },
    {
      id: "xml-doc-iframe",
      label: "createDocument iframe + adoptNode",
      run: () => adoptedRealm(xmlDocIframe, "xml-doc"),
    },
    {
      id: "template-doc-iframe",
      label: "template owner-document iframe + adoptNode",
      run: () => adoptedRealm(templateIframe, "template-doc"),
    },
    {
      id: "range-fragment-iframe",
      label: "iframe via Range.createContextualFragment",
      run: () =>
        parsedIframeRealm(
          document.createRange().createContextualFragment("<iframe></iframe>"),
          "range-fragment",
        ),
    },
    {
      id: "window-open",
      label: "window.open realm",
      run: () => {
        const opened = window.open(env.instanceUrl, "_blank");

        if (!opened) {
          report("isolated:window-open-returned-null");
          return;
        }

        window.setTimeout(() => {
          realm(opened, "window-open");

          try {
            opened.close();
          } catch {
            // already gone
          }
        }, 1000);
      },
    },
    {
      id: "window-parent",
      label: "window.parent",
      run: () => realm(window.parent, "parent"),
    },
    {
      id: "window-top",
      label: "window.top",
      run: () => realm(window.top, "top"),
    },
    {
      id: "frame-element",
      label: "window.frameElement",
      run: () =>
        realm(window.frameElement?.ownerDocument?.defaultView, "frame-element"),
    },
    {
      id: "parent-chain",
      label: "window.parent.parent",
      run: () => realm(window.parent?.parent, "parent-chain"),
    },
    {
      id: "window-frames",
      label: "window.frames[0]",
      run: () => {
        document.body.appendChild(document.adoptNode(htmlDocIframe()));

        realm(
          window.frames?.[0] ?? (window as unknown as Window[])[0],
          "window-frames",
        );
      },
    },
    {
      id: "window-opener",
      label: "window.opener",
      run: () => realm(window.opener, "window-opener"),
    },
    {
      id: "child-frame-grab",
      label: "host iframe's realm",
      run: () => {
        const foreign = Array.from(document.querySelectorAll("iframe"))
          .map((iframe) => iframe.contentWindow)
          .find((win): win is Window => !!win && win !== window);

        realm(foreign ?? null, "child-frame");
      },
    },
    {
      id: "parent-cookie",
      label: "host cookie via window.parent",
      run: () => {
        const ancestor = window.parent;

        if (!ancestor || ancestor === window) {
          report("isolated:parent-is-self");
          return;
        }

        const cookie = ancestor.document.cookie;

        report(
          cookie && cookie.length > 0
            ? `reached:parent-cookie-${cookie.length}-chars`
            : "isolated:empty-cookie",
        );
      },
    },
    {
      id: "parent-local-storage",
      label: "host localStorage via window.parent",
      run: () => parentStorageRead("localStorage"),
    },
    {
      id: "parent-session-storage",
      label: "host sessionStorage via window.parent",
      run: () => parentStorageRead("sessionStorage"),
    },
    {
      id: "parent-indexeddb",
      label: "host indexedDB via window.parent",
      run: () => parentFactoryUse("indexedDB"),
    },
    {
      id: "parent-caches",
      label: "host caches via window.parent",
      run: () => parentFactoryUse("caches"),
    },
    {
      id: "worker",
      label: "Worker",
      run: () => {
        new Worker(blobUrl()).terminate();

        report("reached:worker-constructed");
      },
    },
    {
      id: "shared-worker",
      label: "SharedWorker",
      run: () => {
        new SharedWorker(blobUrl());

        report("reached:shared-worker-constructed");
      },
    },
    {
      id: "service-worker",
      label: "Service worker registration API",
      run: () => {
        const container = navigator.serviceWorker;

        report(
          container && typeof container.register === "function"
            ? "reached:service-worker-reachable"
            : "isolated:no-service-worker",
        );
      },
    },
    {
      id: "dynamic-import",
      label: "Dynamic import",
      run: () => {
        const dynamicImport = new Function("u", "return import(u)") as (
          u: string,
        ) => Promise<unknown>;

        dynamicImport(`${env.instanceUrl}/api/apps/isolation/bundle`)
          .then(() => report("reached:dynamic-import-evaluated"))
          .catch((err) => report(`isolated:${describeError(err)}`));
      },
    },
    {
      id: "allowed-host-redirect",
      label: "allowed_host redirect",
      run: () => {
        fetch("http://localhost:4444/redirect", {
          method: "GET",
          credentials: "include",
        })
          // An opaque / status-0 response means the sandbox fetch refused to
          // follow the redirect across origins; a real response means it did.
          .then((r) =>
            report(
              r.type === "opaqueredirect" || r.status === 0
                ? `isolated:redirect-not-followed-${r.type}`
                : `reached:redirect-followed-${r.type}-${r.status}`,
            ),
          )
          .catch((err) => report(`isolated:${describeError(err)}`));
      },
    },
    {
      id: "font-face",
      label: "credentialed GET via FontFace",
      run: () => {
        const font = new FontFace(
          "isolation",
          `url('${env.instanceUrl}/api/session/properties?font=1')`,
        );

        Promise.resolve(font.load()).catch(() => {});

        report("reached:font-face-load");
      },
    },
    {
      id: "cookie-store",
      label: "cookies via cookieStore",
      run: () => {
        const cookieStore = (
          window as unknown as {
            cookieStore?: { getAll?: () => Promise<unknown[]> };
          }
        ).cookieStore;

        if (!cookieStore?.getAll) {
          report("isolated:no-cookie-store");
          return;
        }

        cookieStore
          .getAll()
          .then((all) =>
            report(
              all && all.length > 0
                ? `reached:cookie-store-${all.length}-cookies`
                : "isolated:cookie-store-empty",
            ),
          )
          .catch((err) => report(`isolated:${describeError(err)}`));
      },
    },
    {
      id: "perf-resource-timing",
      label: "host URLs via resource timing",
      run: () => {
        const count = performance.getEntriesByType("resource").length;

        report(
          count > 0
            ? `reached:resource-timing-${count}-urls`
            : "isolated:no-entries",
        );
      },
    },
    {
      id: "endowment-api",
      label: "Raw API via endowed SDK bundle",
      run: () => endowmentApi(report),
    },
    {
      id: "stack-trace-realm",
      label: "Realm reference via Error.prepareStackTrace",
      run: () => stackTraceRealm(report),
    },
  ];
};
