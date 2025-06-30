import * as React from "react";
import * as ReactJSXRuntime from "react/jsx-runtime";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import * as ReactDOMServer from "react-dom/server";

// Put React to the global object, so it can be used by main SDK bundle
export function defineGlobalReact() {
  if (typeof window !== "undefined") {
    if (!window.React) {
      window.React = React;
    }

    if (!window.ReactJSXRuntime) {
      window.ReactJSXRuntime = ReactJSXRuntime;
    }

    if (!window.ReactDOM) {
      window.ReactDOM = ReactDOM;
    }

    if (!window.ReactDOMClient) {
      window.ReactDOMClient = ReactDOMClient;
    }

    if (!window.ReactDOMServer) {
      window.ReactDOMServer = ReactDOMServer;
    }
  }
}
