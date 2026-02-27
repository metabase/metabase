import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TableDataView } from "./TableDataView";
import "./table-data.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TableDataView />
  </StrictMode>,
);
