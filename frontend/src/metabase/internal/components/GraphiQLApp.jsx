import React from "react";
import ReactDOM from "react-dom";
import GraphiQL from "graphiql";
import fetch from "isomorphic-fetch";

import "graphiql/graphiql.css";

function graphQLFetcher(graphQLParams) {
  return fetch(window.location.origin + "/api/graphql", {
    method: "post",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(graphQLParams),
  }).then(response => response.json());
}

export default () => (
  <div style={{ height: "100vh", width: "100%" }}>
    <GraphiQL fetcher={graphQLFetcher} />
  </div>
);
