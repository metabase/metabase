import {
  clojure,
  getHtmlSource,
  getJsxSource,
  getPugSource,
  node,
  python,
  ruby,
} from "./code-templates";
import type {
  ClientCodeSampleConfig,
  CodeSampleParameters,
  ServerCodeSampleConfig,
} from "./types";

export const getEmbedClientCodeExampleOptions =
  (): ClientCodeSampleConfig[] => [
    {
      id: "pug",
      name: "Pug / Jade",
      source: getPugSource({ iframeUrl: `iframeUrl` }),
      mode: "ace/mode/jade",
    },
    {
      id: "mustache",
      name: "Mustache",
      source: getHtmlSource({ iframeUrl: `"{{iframeUrl}}"` }),
      mode: "ace/mode/html",
    },
    {
      id: "erb",
      name: "ERB",
      source: getHtmlSource({ iframeUrl: `"<%= @iframe_url %>"` }),
      mode: "ace/mode/html_ruby",
    },
    {
      id: "jsx",
      name: "JSX",
      source: getJsxSource({ iframeUrl: `{iframeUrl}` }),
      mode: "ace/mode/jsx",
    },
  ];

export const getEmbedServerCodeExampleOptions = (
  codeSampleParameters: CodeSampleParameters,
): ServerCodeSampleConfig[] => [
  {
    id: "node",
    name: "Node.js",
    source: node.getServerSource(codeSampleParameters),
    parametersSource: node.getParametersSource(codeSampleParameters.params),
    getIframeQuerySource: node.getIframeQuerySource(
      codeSampleParameters.displayOptions,
    ),
    mode: "ace/mode/javascript",
    embedOption: "pug",
  },
  {
    id: "ruby",
    name: "Ruby",
    source: ruby.getServerSource(codeSampleParameters),
    parametersSource: ruby.getParametersSource(codeSampleParameters.params),
    getIframeQuerySource: ruby.getIframeQuerySource(
      codeSampleParameters.displayOptions,
    ),
    mode: "ace/mode/ruby",
    embedOption: "erb",
  },
  {
    id: "python",
    name: "Python",
    source: python.getServerSource(codeSampleParameters),
    parametersSource: python.getParametersSource(codeSampleParameters.params),
    getIframeQuerySource: python.getIframeQuerySource(
      codeSampleParameters.displayOptions,
    ),
    mode: "ace/mode/python",
    embedOption: "pug",
  },
  {
    id: "clojure",
    name: "Clojure",
    source: clojure.getServerSource(codeSampleParameters),
    parametersSource: clojure.getParametersSource(codeSampleParameters.params),
    getIframeQuerySource: clojure.getIframeQuerySource(
      codeSampleParameters.displayOptions,
    ),
    mode: "ace/mode/clojure",
    embedOption: "pug",
  },
];

export const getPublicEmbedHTML = (iframeUrl: string): string =>
  getHtmlSource({ iframeUrl: JSON.stringify(iframeUrl) });
