// import inlineCss from "inline-css";
import ReactDOMServer from "react-dom/server";
import StaticChart from "./containers/StaticChart";
// import createCache from "@emotion/cache";
// import { CacheProvider } from "@emotion/react";

// const key = "custom";
// const cache = createCache({ key });

export function RenderChart(type) {
  return ReactDOMServer.renderToStaticMarkup(
    // <CacheProvider value={cache}>
    <StaticChart />,
    // </CacheProvider>,
  );
}
