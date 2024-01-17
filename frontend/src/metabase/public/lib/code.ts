import type {
  ClientCodeSampleConfig,
  CodeSampleParameters,
  ServerCodeSampleConfig,
} from "./types";
import {
  closure,
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
      name: "Mustache",
      source: getHtmlSource({ iframeUrl: `"{{iframeUrl}}"` }),
      mode: "ace/mode/html",
    },
    {
      name: "Pug / Jade",
      source: getPugSource({ iframeUrl: `iframeUrl` }),
      mode: "ace/mode/jade",
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
  params: CodeSampleParameters,
): ServerCodeSampleConfig[] => [
  {
    name: "Node.js",
    source: node.getServerSource(params),
    parametersSource: node.getParametersSource(params.params),
    getIframeQuerySource: node.getIframeQuerySource(params.displayOptions),
    mode: "ace/mode/javascript",
    embedOption: "Pug / Jade",
  },
  {
    name: "Ruby",
    source: ruby.getServerSource(params),
    parametersSource: ruby.getParametersSource(params.params),
    getIframeQuerySource: ruby.getIframeQuerySource(params.displayOptions),
    mode: "ace/mode/ruby",
    embedOption: "ERB",
  },
  {
    name: "Python",
    source: python.getServerSource(params),
    parametersSource: python.getParametersSource(params.params),
    getIframeQuerySource: python.getIframeQuerySource(params.displayOptions),
    mode: "ace/mode/python",
  },
  {
    name: "Clojure",
    source: closure.getServerSource(params),
    parametersSource: closure.getParametersSource(params.params),
    getIframeQuerySource: closure.getIframeQuerySource(params.displayOptions),
    mode: "ace/mode/clojure",
  },
];

export const getPublicEmbedHTML = (iframeUrl: string): string =>
  getHtmlSource({ iframeUrl: JSON.stringify(iframeUrl) });
