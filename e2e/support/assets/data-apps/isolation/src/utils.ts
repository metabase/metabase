import type { IsolationTestEnv, Report } from "./types";

export const getEnv = (): IsolationTestEnv => {
  const env = (
    globalThis as { __METABASE_DATA_APP_TEST_ENV__?: IsolationTestEnv }
  ).__METABASE_DATA_APP_TEST_ENV__;

  if (!env) {
    throw new Error("isolation fixture: missing test env");
  }

  return env;
};

export const describeError = (err: unknown): string =>
  (err as { message?: string })?.message ?? String(err);

export const blobUrl = () =>
  URL.createObjectURL(new Blob([""], { type: "text/javascript" }));

export const htmlDocIframe = () => {
  const doc = document.implementation.createHTMLDocument("x");
  const iframe = doc.createElement("iframe");

  doc.body.appendChild(iframe);

  return iframe;
};

export const xmlDocIframe = () => {
  const doc = document.implementation.createDocument(
    "http://www.w3.org/1999/xhtml",
    "html",
  );
  const iframe = doc.createElement("iframe") as HTMLIFrameElement;

  doc.documentElement.appendChild(iframe);

  return iframe;
};

export const templateIframe = () => {
  const template = document.createElement("template");
  const iframe = template.content.ownerDocument.createElement(
    "iframe",
  ) as HTMLIFrameElement;

  template.content.appendChild(iframe);

  return iframe;
};

export const realmVerdict = (
  realm: Window | null | undefined,
  label: string,
) => {
  if (!realm || realm === window) {
    return `isolated:${label}-is-self`;
  }

  const realmFetch = realm.fetch;

  return realmFetch && realmFetch !== window.fetch
    ? `reached:${label}-realm`
    : `isolated:${label}-gated`;
};

export const reportRealm = (
  report: Report,
  realm: Window | null | undefined,
  label: string,
) => {
  try {
    report(realmVerdict(realm, label));
  } catch (err) {
    report(`isolated:${describeError(err)}`);
  }
};
