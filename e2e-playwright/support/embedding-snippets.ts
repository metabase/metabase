/**
 * Helpers for the static-embedding code-snippets port
 * (e2e/test/scenarios/embedding/embedding-snippets.cy.spec.js).
 *
 * getEmbeddingJsCode / IFRAME_CODE are faithful ports of the shared
 * e2e/test/scenarios/embedding/shared/embedding-snippets.js — re-implemented
 * here (typed) rather than imported across the e2e/ ⇄ e2e-playwright/ tree: the
 * shared file is untyped JS and specs run from e2e-playwright/ only (PORTING
 * rule 10). The port secret-key / site-url are matched with `.*` (KEYKEYKEY /
 * PORTPORTPORT), so the regex is per-worker-backend-agnostic.
 */
import type { Page } from "@playwright/test";

import { modal } from "./ui";

/** Port of getEmbeddingJsCode: the server-side signed-URL snippet, as a
 * RegExp (secret key and site-url port matched with `.*`). */
export function getEmbeddingJsCode({
  type,
  id,
  downloads,
  theme,
  // Match the actual default value (metabase#43838)
  background = true,
}: {
  type: "question" | "dashboard";
  id: number;
  downloads?: boolean;
  theme?: string;
  background?: boolean;
}): RegExp {
  return new RegExp(
    `// you will need to install via 'npm install jsonwebtoken' or in your package.json

const jwt = require("jsonwebtoken");

const METABASE_SITE_URL = "http://localhost:PORTPORTPORT";
const METABASE_SECRET_KEY = "KEYKEYKEY";
const payload = {
  resource: { ${type}: ${id} },
  params: {},
  exp: Math.round(Date.now() / 1000) + (10 * 60) // 10 minute expiration
};
const token = jwt.sign(payload, METABASE_SECRET_KEY);

const iframeUrl = METABASE_SITE_URL + "/embed/${type}/" + token +
  "#${getThemeParameter(theme)}${getBackgroundParameter(
    background,
  )}bordered=true&titled=true${getParameter({
    downloads,
  })}";`
      .split("\n")
      .join("")
      .replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")
      .replace("KEYKEYKEY", ".*")
      .replace("PORTPORTPORT", ".*"),
  );
}

/** Port of IFRAME_CODE: the frontend (Pug / Jade) iframe snippet, newlines
 * stripped to match the rendered CodeMirror text. */
export const IFRAME_CODE = `iframe(
    src=iframeUrl
    frameborder="0"
    width="800"
    height="600"
    allowtransparency
)`
  .split("\n")
  .join("");

function getThemeParameter(theme?: string) {
  return theme ? `theme=${theme}&` : "";
}

function getBackgroundParameter(background: boolean) {
  return !background ? "background=false&" : "";
}

function getParameter({ downloads }: { downloads?: boolean }) {
  let parameter = "";
  if (downloads !== undefined) {
    parameter += `&downloads=${downloads}`;
  }
  return parameter;
}

/** Port of the spec-local codeBlock(): cy.get(".cm-content"). Scoped to the
 * modal (the only CodeMirror on the page here). .first() = backend snippet,
 * .last() = frontend snippet. */
export function codeBlock(page: Page) {
  return modal(page).locator(".cm-content");
}

/** Port of the spec-local highlightedTexts(): findAllByTestId("highlighted-text"). */
export function highlightedTexts(page: Page) {
  return page.getByTestId("highlighted-text");
}

/** The language <select> input for the server-side snippet. */
export function backendSelectButton(page: Page) {
  return modal(page).getByTestId("embed-backend-select-button");
}

/** The language <select> input for the client-side snippet. */
export function frontendSelectButton(page: Page) {
  return modal(page).getByTestId("embed-frontend-select-button");
}

/**
 * The static-embedding appearance controls (background / download Switches)
 * render as visually-hidden inputs Mantine positions outside the modal's
 * viewport, so a real force-click fails ("outside of viewport"). Cypress's
 * synthetic click had no such constraint — dispatch a coordinate-free click.
 * (Same pattern as public-sharing-embed-button-behavior.spec.ts's local
 * toggleAppearanceControl.)
 */
export async function toggleAppearanceControl(page: Page, label: string) {
  await modal(page).getByLabel(label, { exact: true }).dispatchEvent("click");
}
