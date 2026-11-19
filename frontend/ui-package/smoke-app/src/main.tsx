import "@metabase/ui/styles.css";
import "@metabase/ui/fonts.css";
import { createRoot } from "react-dom/client";

import { App } from "./App";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
