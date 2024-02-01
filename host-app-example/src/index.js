import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { MetabaseProvider } from "metabase-embedding-sdk";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <MetabaseProvider
    apiUrl={"http://localhost:3000"}
    apiKey={"mb_sfmfeTfUONsMuMPbdpP2HOhSzS3cMFrSeDS9NNpsHn8="}
  >
    <App />
  </MetabaseProvider>,
);
