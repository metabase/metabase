import type {
  ClientCodeSampleConfig,
  CodeSampleParameters,
  ServerCodeSampleConfig,
} from "./types";
import {
  clojure,
  getHtmlSource,
  getJsxSource,
  getPugSource,
  node,
  python,
  ruby,
} from "./code-templates";

export const getEmbedClientCodeExampleOptions =
  (): ClientCodeSampleConfig[] => [
    {
      name: "Pug / Jade",
      source: getPugSource({ iframeUrl: `iframeUrl` }),
      mode: "ace/mode/jade",
    },
    {
      name: "Mustache",
      source: getHtmlSource({ iframeUrl: `"{{iframeUrl}}"` }),
      mode: "ace/mode/html",
    },
    {
      name: "ERB",
      source: getHtmlSource({ iframeUrl: `"<%= @iframe_url %>"` }),
      mode: "ace/mode/html_ruby",
    },
    {
      name: "JSX",
      source: getJsxSource({ iframeUrl: `{iframeUrl}` }),
      mode: "ace/mode/jsx",
    },
  ];

export const getEmbedServerCodeExampleOptions = (
  codeSampleParameters: CodeSampleParameters,
): ServerCodeSampleConfig[] => [
  {
    name: "Node.js",
    source: node.getServerSource(codeSampleParameters),
    parametersSource: node.getParametersSource(codeSampleParameters.params),
    getIframeQuerySource: node.getIframeQuerySource(
      codeSampleParameters.displayOptions,
    ),
    mode: "ace/mode/javascript",
    embedOption: "Pug / Jade",
  },
  {
    name: "Ruby",
    source: ruby.getServerSource(codeSampleParameters),
    parametersSource: ruby.getParametersSource(codeSampleParameters.params),
    getIframeQuerySource: ruby.getIframeQuerySource(
      codeSampleParameters.displayOptions,
    ),
    mode: "ace/mode/ruby",
    embedOption: "ERB",
  },
  {
    name: "Python",
    source: python.getServerSource(codeSampleParameters),
    parametersSource: python.getParametersSource(codeSampleParameters.params),
    getIframeQuerySource: python.getIframeQuerySource(
      codeSampleParameters.displayOptions,
    ),
    mode: "ace/mode/python",
    embedOption: "Pug / Jade",
  },
  {
    name: "Clojure",
    source: clojure.getServerSource(codeSampleParameters),
    parametersSource: clojure.getParametersSource(codeSampleParameters.params),
    getIframeQuerySource: clojure.getIframeQuerySource(
      codeSampleParameters.displayOptions,
    ),
    mode: "ace/mode/clojure",
    embedOption: "Pug / Jade",
  },
];

export const getPublicEmbedHTML = (iframeUrl: string): string =>
  getHtmlSource({ iframeUrl: JSON.stringify(iframeUrl) });
