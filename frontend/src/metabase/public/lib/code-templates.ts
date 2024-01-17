import type { CodeSampleParameters } from "./types";
import { optionsToHashParams } from "./embed";

export const node = {
  getParametersSource: ({ params }: CodeSampleParameters) =>
    `params: ${JSON.stringify(params, null, 2).split("\n").join("\n  ")},`,

  getIframeQuerySource: ({
    resourceType,
    displayOptions,
  }: CodeSampleParameters) =>
    `var iframeUrl = METABASE_SITE_URL + "/embed/${resourceType}/" + token + ${JSON.stringify(
      optionsToHashParams(displayOptions),
    )};`,

  getServerSource: (sampleParameters: CodeSampleParameters) =>
    `// you will need to install via 'npm install jsonwebtoken' or in your package.json

var jwt = require("jsonwebtoken");

var METABASE_SITE_URL = ${JSON.stringify(sampleParameters.siteUrl)};
var METABASE_SECRET_KEY = ${JSON.stringify(sampleParameters.secretKey)};

var payload = {
  resource: { ${sampleParameters.resourceType}: ${
      sampleParameters.resourceId
    } },
  ${node.getParametersSource(sampleParameters)}
  exp: Math.round(Date.now() / 1000) + (10 * 60) // 10 minute expiration
};
var token = jwt.sign(payload, METABASE_SECRET_KEY);

${node.getIframeQuerySource(sampleParameters)}`,
};

export const python = {
  getParametersSource: ({ params }: CodeSampleParameters) =>
    `"params": {
    ${Object.entries(params)
      .map(([key, value]) => JSON.stringify(key) + ": " + JSON.stringify(value))
      .join(",\n    ")}
  },`,

  getIframeQuerySource: ({
    resourceType,
    displayOptions,
  }: CodeSampleParameters) =>
    `iframeUrl = METABASE_SITE_URL + "/embed/${resourceType}/" + token + ${JSON.stringify(
      optionsToHashParams(displayOptions),
    )}`,

  getServerSource: (sampleParameters: CodeSampleParameters) =>
    `# You'll need to install PyJWT via pip 'pip install PyJWT' or your project packages file

import jwt
import time

METABASE_SITE_URL = ${JSON.stringify(sampleParameters.siteUrl)}
METABASE_SECRET_KEY = ${JSON.stringify(sampleParameters.secretKey)}

payload = {
  "resource": {"${sampleParameters.resourceType}": ${
      sampleParameters.resourceId
    }},
  ${python.getParametersSource(sampleParameters)}
  "exp": round(time.time()) + (60 * 10) # 10 minute expiration
}
token = jwt.encode(payload, METABASE_SECRET_KEY, algorithm="HS256")

${python.getIframeQuerySource(sampleParameters)}`,
};

export const ruby = {
  getParametersSource: ({ params }: CodeSampleParameters) =>
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

  getIframeQuerySource: ({
    resourceType,
    displayOptions,
  }: CodeSampleParameters) =>
    `iframe_url = METABASE_SITE_URL + "/embed/${resourceType}/" + token + ${JSON.stringify(
      optionsToHashParams(displayOptions),
    )}`,

  getServerSource: (sampleParameters: CodeSampleParameters) =>
    `# you will need to install 'jwt' gem first via 'gem install jwt' or in your project Gemfile

require 'jwt'

METABASE_SITE_URL = ${JSON.stringify(sampleParameters.siteUrl)}
METABASE_SECRET_KEY = ${JSON.stringify(sampleParameters.secretKey)}

payload = {
  :resource => {:${sampleParameters.resourceType} => ${
      sampleParameters.resourceId
    }},
  ${ruby.getParametersSource(sampleParameters)}
  :exp => Time.now.to_i + (60 * 10) # 10 minute expiration
}
token = JWT.encode payload, METABASE_SECRET_KEY

${ruby.getIframeQuerySource(sampleParameters)}`,
};

export const closure = {
  getParametersSource: ({ params }: CodeSampleParameters) =>
    `:params   {${Object.entries(params)
      .map(([key, value]) => JSON.stringify(key) + " " + JSON.stringify(value))
      .join(",\n              ")}}`,

  getIframeQuerySource: ({
    resourceType,
    displayOptions,
  }: CodeSampleParameters) =>
    `(def iframe-url (str metabase-site-url "/embed/${resourceType}/" token ${JSON.stringify(
      optionsToHashParams(displayOptions),
    )}))`,

  getServerSource: (sampleParameters: CodeSampleParameters) =>
    `(require '[buddy.sign.jwt :as jwt])

(def metabase-site-url   ${JSON.stringify(sampleParameters.siteUrl)})
(def metabase-secret-key ${JSON.stringify(sampleParameters.secretKey)})

(def payload
  {:resource {:${sampleParameters.resourceType} ${sampleParameters.resourceId}}
   ${closure.getParametersSource(sampleParameters)}
   :exp      (+ (int (/ (System/currentTimeMillis) 1000)) (* 60 10))}) ; 10 minute expiration

(def token (jwt/sign payload metabase-secret-key))

${closure.getIframeQuerySource(sampleParameters)}`,
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
