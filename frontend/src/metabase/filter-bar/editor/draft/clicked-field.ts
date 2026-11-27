import type { DraftStep } from "./types";

export const getClickedField = ({ target }: MouseEvent) => {
  const value =
    target instanceof Element ? target.closest("[data-part=value]") : null;
  const root = value?.closest("[data-node-view-wrapper]");
  if (!value || !root) {
    return null;
  }
  return [...root.querySelectorAll("[data-part=value]")].indexOf(value);
};

const PARTS: DraftStep[] = ["column", "operator", "value"];

export const getClickedPart = ({ target }: MouseEvent) => {
  const element = target instanceof Element ? target : null;
  const part = element?.closest("[data-part]")?.getAttribute("data-part");
  return PARTS.find((step) => step === part) ?? null;
};
