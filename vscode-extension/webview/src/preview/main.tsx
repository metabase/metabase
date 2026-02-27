import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TransformPreview } from "./TransformPreview";
import "./preview.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TransformPreview />
  </StrictMode>,
);
