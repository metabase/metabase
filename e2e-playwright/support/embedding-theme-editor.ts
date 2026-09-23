/**
 * Helpers for the embedding theme-editor port
 * (e2e/test/scenarios/embedding/embedding-theme-editor/theme-editor.cy.spec.ts).
 *
 * The static-embedding appearance/theme editor lives under
 * /admin/embedding/themes/:id (EE + `pro-self-hosted` token). These are ports of
 * the spec-local createThemeViaApi / visitThemeEditor / changeColor helpers; the
 * shared main()/popover() locators come from support/ui.ts (imported read-only).
 */
import type { Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { main, popover } from "./ui";

export interface EmbedTheme {
  id: number;
  name: string;
  settings: Record<string, unknown>;
}

/** Port of the spec-local createThemeViaApi: POST /api/embed-theme with a full
 * default color set, returning the created theme (the FE then edits it). */
export async function createThemeViaApi(
  api: MetabaseApi,
  name = "Test theme",
): Promise<EmbedTheme> {
  const response = await api.post("/api/embed-theme", {
    name,
    settings: {
      colors: {
        brand: "#509EE3",
        background: "#ffffff",
        "text-primary": "#2E353B",
        "text-secondary": "#697D8C",
        "text-tertiary": "#949AAB",
        border: "#EEECEC",
        "background-secondary": "#F9FBFC",
        filter: "#7172AD",
        summarize: "#88BF4D",
        positive: "#84BB4C",
        negative: "#ED6E6E",
        shadow: "#000000",
        charts: [
          "#509EE3",
          "#88BF4D",
          "#A989C5",
          "#EF8C8C",
          "#F9D45C",
          "#F2A86F",
          "#98D9D9",
          "#7172AD",
        ],
      },
      fontFamily: "",
      fontSize: "",
    },
  });
  return (await response.json()) as EmbedTheme;
}

/** Port of the spec-local visitThemeEditor: navigate to the editor and wait for
 * the theme GET (the Cypress "@getTheme" alias). Registered before the goto that
 * triggers it (PORTING rule 2). */
export async function visitThemeEditor(page: Page, themeId: number) {
  const getTheme = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === `/api/embed-theme/${themeId}`,
  );
  await page.goto(`/admin/embedding/themes/${themeId}`);
  await getTheme;
}

/**
 * Port of the spec-local changeColor. Opens a ColorSwatchCard's popover by
 * clicking the card (the swatch label's grandparent — Text → Flex → Card), fills
 * the hex ColorInput, and dismisses the Mantine popover with Escape.
 *
 * fill() replaces the input in one input event; ColorInput's onChange fires
 * per-change and parses "FF0000" as "#FF0000", so the saved value is the
 * alpha-suffixed "#ff0000ff" the tests assert. Escape here targets the open
 * floating popover (not a window-level handler), so no mouse-parking is needed.
 */
export async function changeColor(page: Page, label: string, value: string) {
  await main(page)
    .getByText(label, { exact: true })
    .locator("..")
    .locator("..")
    .click();

  await popover(page).locator("input").first().fill(value);

  await page.keyboard.press("Escape");
}
