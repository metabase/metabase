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
    parametersSource: node.getParametersSource(params),
    iframeUrlSource: node.getIframeUrlSource(params),
    mode: "ace/mode/javascript",
  },
  {
    name: "Ruby",
    source: ruby.getServerSource(params),
    parametersSource: ruby.getParametersSource(params),
    iframeUrlSource: ruby.getIframeUrlSource(params),
    mode: "ace/mode/ruby",
  },
  {
    name: "Python",
    source: python.getServerSource(params),
    parametersSource: python.getParametersSource(params),
    iframeUrlSource: python.getIframeUrlSource(params),
    mode: "ace/mode/python",
  },
  {
    name: "Clojure",
    source: closure.getServerSource(params),
    parametersSource: closure.getParametersSource(params),
    iframeUrlSource: closure.getIframeUrlSource(params),
    mode: "ace/mode/clojure",
  },
];

export const getPublicEmbedHTML = (iframeUrl: string): string =>
  getHtmlSource({ iframeUrl: JSON.stringify(iframeUrl) });
