import { match } from "ts-pattern";

import { optionsToHashParams } from "./embed";
import type {
  CodeSampleParameters,
  EmbeddingDisplayOptions,
  EmbeddingHashOptions,
  EmbeddingParametersValues,
} from "./types";

export function getIframeQueryWithoutDefaults(
  displayOptions: EmbeddingDisplayOptions,
) {
  const hashOptions = transformEmbeddingDisplayToHashOptions(displayOptions);

  return optionsToHashParams(
    removeDefaultValueParameters(hashOptions, {
      theme: "light",
      background: true,
    }),
  );
}

function transformEmbeddingDisplayToHashOptions(
  displayOptions: EmbeddingDisplayOptions,
): EmbeddingHashOptions {
  const downloads = match(displayOptions.downloads)
    .with(null, () => null) // do not include the "downloads" parameter at all, used for OSS.
    .with({ pdf: true, results: false }, () => "pdf")
    .with({ pdf: false, results: true }, () => "results")
    .with({ pdf: false, results: false }, () => false)
    .otherwise(() => true);

  return { ...displayOptions, downloads };
}

function getIframeQuerySource(
  displayOptions: EmbeddingDisplayOptions | undefined,
) {
  if (!displayOptions) {
    return "";
  }

  return JSON.stringify(getIframeQueryWithoutDefaults(displayOptions));
}

function removeDefaultValueParameters(
  options: EmbeddingHashOptions,
  defaultValues: Partial<EmbeddingHashOptions>,
): Partial<EmbeddingHashOptions> {
  return Object.fromEntries(
    Object.entries(options).filter(
      ([key, value]) =>
        value !== defaultValues[key as keyof EmbeddingDisplayOptions],
    ),
  );
}

export const node = {
  getParametersSource: (params: EmbeddingParametersValues) =>
    `params: ${JSON.stringify(params, null, 2).split("\n").join("\n  ")},`,

  getIframeQuerySource,

  getServerSource: ({
    siteUrl,
    secretKey,
    resourceType,
    resourceId,
    params,
    displayOptions,
    withIframeSnippet,
  }: CodeSampleParameters) =>
    `// you will need to install via 'npm install jsonwebtoken' or in your package.json

const jwt = require("jsonwebtoken");

${withIframeSnippet ? `const METABASE_SITE_URL = ${JSON.stringify(siteUrl)};` : ""}
const METABASE_SECRET_KEY = ${JSON.stringify(secretKey)};

const payload = {
  resource: { ${resourceType}: ${resourceId} },
  ${node.getParametersSource(params)}
  exp: Math.round(Date.now() / 1000) + (10 * 60) // 10 minute expiration
};
const token = jwt.sign(payload, METABASE_SECRET_KEY);

${
  withIframeSnippet
    ? `const iframeUrl = METABASE_SITE_URL + "/embed/${resourceType}/" + token +
  ${node.getIframeQuerySource(displayOptions)};`
    : ""
}
`.trim(),
};

export const python = {
  getParametersSource: (params: EmbeddingParametersValues) =>
    `"params": {
    ${Object.entries(params)
      .map(([key, value]) => JSON.stringify(key) + ": " + JSON.stringify(value))
      .join(",\n    ")}
  },`,

  getIframeQuerySource,

  getServerSource: ({
    siteUrl,
    secretKey,
    resourceType,
    resourceId,
    params,
    displayOptions,
    withIframeSnippet,
  }: CodeSampleParameters) =>
    `# You'll need to install PyJWT via pip 'pip install PyJWT' or your project packages file

import jwt
import time

${withIframeSnippet ? `METABASE_SITE_URL = ${JSON.stringify(siteUrl)}` : ""}
METABASE_SECRET_KEY = ${JSON.stringify(secretKey)}

payload = {
  "resource": {"${resourceType}": ${resourceId}},
  ${python.getParametersSource(params)}
  "exp": round(time.time()) + (60 * 10) # 10 minute expiration
}
token = jwt.encode(payload, METABASE_SECRET_KEY, algorithm="HS256")

${withIframeSnippet ? `iframeUrl = METABASE_SITE_URL + "/embed/${resourceType}/" + token + ${python.getIframeQuerySource(displayOptions)}` : ""}
`.trim(),
};

export const ruby = {
  getParametersSource: (params: EmbeddingParametersValues) =>
    `:params => {
    ${Object.entries(params)
      .map(
        ([key, value]) =>
          JSON.stringify(key) +
          " => " +
          (value === null ? "nil" : JSON.stringify(value)),
      )
      .join(",\n    ")}
  },`,

  getIframeQuerySource,

  getServerSource: ({
    siteUrl,
    secretKey,
    resourceType,
    resourceId,
    params,
    displayOptions,
    withIframeSnippet,
  }: CodeSampleParameters) =>
    `# you will need to install 'jwt' gem first via 'gem install jwt' or in your project Gemfile

require 'jwt'

${withIframeSnippet ? `METABASE_SITE_URL = ${JSON.stringify(siteUrl)}` : ""}
METABASE_SECRET_KEY = ${JSON.stringify(secretKey)}

payload = {
  :resource => {:${resourceType} => ${resourceId}},
  ${ruby.getParametersSource(params)}
  :exp => Time.now.to_i + (60 * 10) # 10 minute expiration
}
token = JWT.encode payload, METABASE_SECRET_KEY

${
  withIframeSnippet
    ? `iframe_url = METABASE_SITE_URL + "/embed/${resourceType}/" + token +
  ${ruby.getIframeQuerySource(displayOptions)}`
    : ""
}
`.trim(),
};

export const clojure = {
  getParametersSource: (params: EmbeddingParametersValues) =>
    `:params   {${Object.entries(params)
      .map(([key, value]) => JSON.stringify(key) + " " + JSON.stringify(value))
      .join(",\n              ")}}`,

  getIframeQuerySource,

  getServerSource: ({
    siteUrl,
    secretKey,
    resourceType,
    resourceId,
    params,
    displayOptions,
    withIframeSnippet,
  }: CodeSampleParameters) =>
    `(require '[buddy.sign.jwt :as jwt])

${withIframeSnippet ? `(def metabase-site-url   ${JSON.stringify(siteUrl)})` : ""}
(def metabase-secret-key ${JSON.stringify(secretKey)})

(def payload
  {:resource {:${resourceType} ${resourceId}}
   ${clojure.getParametersSource(params)}
   :exp      (+ (int (/ (System/currentTimeMillis) 1000)) (* 60 10))}) ; 10 minute expiration

(def token (jwt/sign payload metabase-secret-key))

${
  withIframeSnippet
    ? `(def iframe-url (str metabase-site-url "/embed/${resourceType}/" token
  ${clojure.getIframeQuerySource(displayOptions)}))`
    : ""
}
`.trim(),
};

export const getHtmlSource = ({ iframeUrl }: { iframeUrl: string }) =>
  `<iframe
    src=${iframeUrl}
    frameborder="0"
    width="800"
    height="600"
    allowtransparency
></iframe>`;

export const getJsxSource = ({ iframeUrl }: { iframeUrl: string }) =>
  `<iframe
    src=${iframeUrl}
    frameBorder={0}
    width={800}
    height={600}
    allowTransparency
/>`;

export const getPugSource = ({ iframeUrl }: { iframeUrl: string }) =>
  `iframe(
    src=${iframeUrl}
    frameborder="0"
    width="800"
    height="600"
    allowtransparency
)`;

export const getPublicEmbedHTMLWithResizer = (iframeUrl: string): string => {
  // Extract the site URL (origin) from the iframe URL
  // iframeUrl is typically a JSON string like "\"https://metabase.example.com/public/document/uuid\""
  const urlMatch = iframeUrl.match(/https?:\/\/[^/]+/);
  const siteUrl = urlMatch ? urlMatch[0] : "";

  return `<iframe
    src=${iframeUrl}
    frameborder="0"
    width="800"
    allowtransparency
></iframe>
<script src="${siteUrl}/app/iframeResizer.js"></script>
<script>
  iFrameResize({}, 'iframe');
</script>`;
};
