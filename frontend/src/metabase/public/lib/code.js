/* @flow */

import { optionsToHashParams } from "./embed";

export type CodeSampleOption = {
  name: string,
  source: () => string,
  mode?: string,
  embedOption?: string,
};

export const getPublicEmbedOptions = ({
  iframeUrl,
}: {
  iframeUrl: string,
}): CodeSampleOption[] => [
  {
    name: "HTML",
    source: () => html({ iframeUrl: `"${iframeUrl}"` }),
    mode: "ace/mode/html",
  },
];

export const getSignedEmbedOptions = (): CodeSampleOption[] => [
  {
    name: "Mustache",
    source: () => html({ iframeUrl: `"{{iframeUrl}}"`, mode: "ace/mode/html" }),
  },
  { name: "Pug / Jade", source: () => pug({ iframeUrl: `iframeUrl` }) },
  { name: "ERB", source: () => html({ iframeUrl: `"<%= @iframe_url %>"` }) },
  {
    name: "JSX",
    source: () => jsx({ iframeUrl: `{iframeUrl}`, mode: "ace/mode/jsx" }),
  },
];

export const getSignTokenOptions = (params: any): CodeSampleOption[] => [
  {
    name: "Node.js",
    source: () => node(params),
    mode: "ace/mode/javascript",
    embedOption: "Pug / Jade",
  },
  {
    name: "Ruby",
    source: () => ruby(params),
    mode: "ace/mode/ruby",
    embedOption: "ERB",
  },
  { name: "Python", source: () => python(params), mode: "ace/mode/python" },
  { name: "Clojure", source: () => clojure(params), mode: "ace/mode/clojure" },
];

export const getPublicEmbedHTML = (iframeUrl: string): string =>
  html({ iframeUrl: JSON.stringify(iframeUrl) });

const html = ({ iframeUrl }) =>
  `<iframe
    src=${iframeUrl}
    frameborder="0"
    width="800"
    height="600"
    allowtransparency
></iframe>`;

const jsx = ({ iframeUrl }) =>
  `<iframe
    src=${iframeUrl}
    frameBorder={0}
    width={800}
    height={600}
    allowTransparency
/>`;

const pug = ({ iframeUrl }) =>
  `iframe(
    src=${iframeUrl}
    frameborder="0"
    width="800"
    height="600"
    allowtransparency
)`;

const node = ({
  siteUrl,
  secretKey,
  resourceType,
  resourceId,
  params,
  displayOptions,
}) =>
  `// you will need to install via 'npm install jsonwebtoken' or in your package.json

var jwt = require("jsonwebtoken");

var METABASE_SITE_URL = ${JSON.stringify(siteUrl)};
var METABASE_SECRET_KEY = ${JSON.stringify(secretKey)};

var payload = {
  resource: { ${resourceType}: ${resourceId} },
  params: ${JSON.stringify(params, null, 2)
    .split("\n")
    .join("\n  ")},
  exp: Math.round(Date.now() / 1000) + (10 * 60) // 10 minute expiration
};
var token = jwt.sign(payload, METABASE_SECRET_KEY);

var iframeUrl = METABASE_SITE_URL + "/embed/${resourceType}/" + token${
    optionsToHashParams(displayOptions)
      ? " + " + JSON.stringify(optionsToHashParams(displayOptions))
      : ""
  };`;

const ruby = ({
  siteUrl,
  secretKey,
  resourceType,
  resourceId,
  params,
  displayOptions,
}) =>
  `# you will need to install 'jwt' gem first via 'gem install jwt' or in your project Gemfile

require 'jwt'

METABASE_SITE_URL = ${JSON.stringify(siteUrl)}
METABASE_SECRET_KEY = ${JSON.stringify(secretKey)}

payload = {
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
}
token = JWT.encode payload, METABASE_SECRET_KEY

iframe_url = METABASE_SITE_URL + "/embed/${resourceType}/" + token${
    optionsToHashParams(displayOptions)
      ? " + " + JSON.stringify(optionsToHashParams(displayOptions))
      : ""
  }`;

const python = ({
  siteUrl,
  secretKey,
  resourceType,
  resourceId,
  params,
  displayOptions,
}) =>
  `# You'll need to install PyJWT via pip 'pip install PyJWT' or your project packages file

import jwt
import time

METABASE_SITE_URL = ${JSON.stringify(siteUrl)}
METABASE_SECRET_KEY = ${JSON.stringify(secretKey)}

payload = {
  "resource": {"${resourceType}": ${resourceId}},
  "params": {
    ${Object.entries(params)
      .map(([key, value]) => JSON.stringify(key) + ": " + JSON.stringify(value))
      .join(",\n    ")}
  },
  "exp": round(time.time()) + (60 * 10) # 10 minute expiration
}
token = jwt.encode(payload, METABASE_SECRET_KEY, algorithm="HS256")

iframeUrl = METABASE_SITE_URL + "/embed/${resourceType}/" + token.decode("utf8")${
    optionsToHashParams(displayOptions)
      ? " + " + JSON.stringify(optionsToHashParams(displayOptions))
      : ""
  }`;

const clojure = ({
  siteUrl,
  secretKey,
  resourceType,
  resourceId,
  params,
  displayOptions,
}) =>
  `(require '[buddy.sign.jwt :as jwt])

(def metabase-site-url   ${JSON.stringify(siteUrl)})
(def metabase-secret-key ${JSON.stringify(secretKey)})

(def payload
  {:resource {:${resourceType} ${resourceId}}
   :params   {${Object.entries(params)
     .map(([key, value]) => JSON.stringify(key) + " " + JSON.stringify(value))
     .join(",\n              ")}}
   :exp      (+ (int (/ (System/currentTimeMillis) 1000)) (* 60 10))}) ; 10 minute expiration

(def token (jwt/sign payload metabase-secret-key))

(def iframe-url (str metabase-site-url "/embed/${resourceType}/" token${
    optionsToHashParams(displayOptions)
      ? " " + JSON.stringify(optionsToHashParams(displayOptions))
      : ""
  }))`;
