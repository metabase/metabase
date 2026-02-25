import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { NotebookApp } from "./NotebookApp";
import "./notebook.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NotebookApp />
  </StrictMode>,
);
