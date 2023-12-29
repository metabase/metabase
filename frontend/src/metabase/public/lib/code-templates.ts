import type { CodeSampleParameters } from "./types";
import { optionsToHashParams } from "./embed";

export const node = {
  getParametersSource: ({
    resourceType,
    resourceId,
    params,
  }: CodeSampleParameters) =>
    `var payload = {
  resource: { ${resourceType}: ${resourceId} },
  params: ${JSON.stringify(params, null, 2).split("\n").join("\n  ")},
  exp: Math.round(Date.now() / 1000) + (10 * 60) // 10 minute expiration
};`,

  getIframeUrlSource: ({
    resourceType,
    displayOptions,
  }: CodeSampleParameters) =>
    `var iframeUrl = METABASE_SITE_URL + "/embed/${resourceType}/" + token${
      optionsToHashParams(displayOptions)
        ? " + " + JSON.stringify(optionsToHashParams(displayOptions))
        : ""
    };`,

  getServerSource: (sampleParameters: CodeSampleParameters) =>
    `// you will need to install via 'npm install jsonwebtoken' or in your package.json

var jwt = require("jsonwebtoken");

var METABASE_SITE_URL = ${JSON.stringify(sampleParameters.siteUrl)};
var METABASE_SECRET_KEY = ${JSON.stringify(sampleParameters.secretKey)};

${node.getParametersSource(sampleParameters)}
var token = jwt.sign(payload, METABASE_SECRET_KEY);

${node.getIframeUrlSource(sampleParameters)}`,
};

export const python = {
  getParametersSource: ({
    resourceType,
    resourceId,
    params,
  }: CodeSampleParameters) =>
    `payload = {
  "resource": {"${resourceType}": ${resourceId}},
  "params": {
    ${Object.entries(params)
      .map(([key, value]) => JSON.stringify(key) + ": " + JSON.stringify(value))
      .join(",\n    ")}
  },
  "exp": round(time.time()) + (60 * 10) # 10 minute expiration
}`,

  getIframeUrlSource: ({
    resourceType,
    displayOptions,
  }: CodeSampleParameters) =>
    `iframeUrl = METABASE_SITE_URL + "/embed/${resourceType}/" + token${
      optionsToHashParams(displayOptions)
        ? " + " + JSON.stringify(optionsToHashParams(displayOptions))
        : ""
    }`,

  getServerSource: (sampleParameters: CodeSampleParameters) =>
    `# You'll need to install PyJWT via pip 'pip install PyJWT' or your project packages file

import jwt
import time

METABASE_SITE_URL = ${JSON.stringify(sampleParameters.siteUrl)}
METABASE_SECRET_KEY = ${JSON.stringify(sampleParameters.secretKey)}

${python.getParametersSource(sampleParameters)}
token = jwt.encode(payload, METABASE_SECRET_KEY, algorithm="HS256")

${python.getIframeUrlSource(sampleParameters)}`,
};

export const ruby = {
  getParametersSource: ({
    resourceType,
    resourceId,
    params,
  }: CodeSampleParameters) =>
    `payload = {
  :resource => {:${resourceType} => ${resourceId}},
  :params => {
    ${Object.entries(params)
      .map(
        ([key, value]) =>
          JSON.stringify(key) +
          " => " +
          (value === null ? "nil" : JSON.stringify(value)),
      )
      .join(",\n    ")}
  },
  :exp => Time.now.to_i + (60 * 10) # 10 minute expiration
}`,

  getIframeUrlSource: ({
    resourceType,
    displayOptions,
  }: CodeSampleParameters) =>
    `iframe_url = METABASE_SITE_URL + "/embed/${resourceType}/" + token${
      optionsToHashParams(displayOptions)
        ? " + " + JSON.stringify(optionsToHashParams(displayOptions))
        : ""
    }`,

  getServerSource: (sampleParameters: CodeSampleParameters) =>
    `# you will need to install 'jwt' gem first via 'gem install jwt' or in your project Gemfile

require 'jwt'

METABASE_SITE_URL = ${JSON.stringify(sampleParameters.siteUrl)}
METABASE_SECRET_KEY = ${JSON.stringify(sampleParameters.secretKey)}

${ruby.getParametersSource(sampleParameters)}
token = JWT.encode payload, METABASE_SECRET_KEY

${ruby.getIframeUrlSource(sampleParameters)}`,
};

export const closure = {
  getParametersSource: ({
    resourceType,
    resourceId,
    params,
  }: CodeSampleParameters) =>
    `(def payload
  {:resource {:${resourceType} ${resourceId}}
   :params   {${Object.entries(params)
     .map(([key, value]) => JSON.stringify(key) + " " + JSON.stringify(value))
     .join(",\n              ")}}
   :exp      (+ (int (/ (System/currentTimeMillis) 1000)) (* 60 10))}) ; 10 minute expiration`,

  getIframeUrlSource: ({
    resourceType,
    displayOptions,
  }: CodeSampleParameters) =>
    `(def iframe-url (str metabase-site-url "/embed/${resourceType}/" token${
      optionsToHashParams(displayOptions)
        ? " " + JSON.stringify(optionsToHashParams(displayOptions))
        : ""
    }))`,

  getServerSource: (sampleParameters: CodeSampleParameters) =>
    `(require '[buddy.sign.jwt :as jwt])

(def metabase-site-url   ${JSON.stringify(sampleParameters.siteUrl)})
(def metabase-secret-key ${JSON.stringify(sampleParameters.secretKey)})

${closure.getParametersSource(sampleParameters)}

(def token (jwt/sign payload metabase-secret-key))

${closure.getIframeUrlSource(sampleParameters)}`,
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
