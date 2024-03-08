import { optionsToHashParams } from "./embed";
import type {
  CodeSampleParameters,
  EmbeddingDisplayOptions,
  EmbeddingParametersValues,
} from "./types";

function getIframeQuerySource(displayOptions: EmbeddingDisplayOptions) {
  return JSON.stringify(
    optionsToHashParams(
      removeDefaultValueParameters(displayOptions, {
        theme: "light",
        hide_download_button: false,
      }),
    ),
  );
}

function removeDefaultValueParameters(
  options: EmbeddingDisplayOptions,
  defaultValues: Partial<EmbeddingDisplayOptions>,
): Partial<EmbeddingDisplayOptions> {
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
  }: CodeSampleParameters) =>
    `// you will need to install via 'npm install jsonwebtoken' or in your package.json

var jwt = require("jsonwebtoken");

var METABASE_SITE_URL = ${JSON.stringify(siteUrl)};
var METABASE_SECRET_KEY = ${JSON.stringify(secretKey)};

var payload = {
  resource: { ${resourceType}: ${resourceId} },
  ${node.getParametersSource(params)}
  exp: Math.round(Date.now() / 1000) + (10 * 60) // 10 minute expiration
};
var token = jwt.sign(payload, METABASE_SECRET_KEY);

var iframeUrl = METABASE_SITE_URL + "/embed/${resourceType}/" + token +
  ${node.getIframeQuerySource(displayOptions)};`,
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
  }: CodeSampleParameters) =>
    `# You'll need to install PyJWT via pip 'pip install PyJWT' or your project packages file

import jwt
import time

METABASE_SITE_URL = ${JSON.stringify(siteUrl)}
METABASE_SECRET_KEY = ${JSON.stringify(secretKey)}

payload = {
  "resource": {"${resourceType}": ${resourceId}},
  ${python.getParametersSource(params)}
  "exp": round(time.time()) + (60 * 10) # 10 minute expiration
}
token = jwt.encode(payload, METABASE_SECRET_KEY, algorithm="HS256")

iframeUrl = METABASE_SITE_URL + "/embed/${resourceType}/" + token +
  ${python.getIframeQuerySource(displayOptions)}`,
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
  }: CodeSampleParameters) =>
    `# you will need to install 'jwt' gem first via 'gem install jwt' or in your project Gemfile

require 'jwt'

METABASE_SITE_URL = ${JSON.stringify(siteUrl)}
METABASE_SECRET_KEY = ${JSON.stringify(secretKey)}

payload = {
  :resource => {:${resourceType} => ${resourceId}},
  ${ruby.getParametersSource(params)}
  :exp => Time.now.to_i + (60 * 10) # 10 minute expiration
}
token = JWT.encode payload, METABASE_SECRET_KEY

iframe_url = METABASE_SITE_URL + "/embed/${resourceType}/" + token +
  ${ruby.getIframeQuerySource(displayOptions)}`,
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
  }: CodeSampleParameters) =>
    `(require '[buddy.sign.jwt :as jwt])

(def metabase-site-url   ${JSON.stringify(siteUrl)})
(def metabase-secret-key ${JSON.stringify(secretKey)})

(def payload
  {:resource {:${resourceType} ${resourceId}}
   ${clojure.getParametersSource(params)}
   :exp      (+ (int (/ (System/currentTimeMillis) 1000)) (* 60 10))}) ; 10 minute expiration

(def token (jwt/sign payload metabase-secret-key))

(def iframe-url (str metabase-site-url "/embed/${resourceType}/" token
  ${clojure.getIframeQuerySource(displayOptions)}))`,
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
