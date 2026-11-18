import { mkdirSync } from "fs";

import { expect, test, type Page } from "@playwright/test";

const ARTIFACTS_DIR = "test-artifacts";
const SCHEMES = ["light", "dark"] as const;

type Scheme = (typeof SCHEMES)[number];

async function openPage(page: Page, scheme: Scheme) {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      problems.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) =>
    problems.push(`requestfailed: ${request.url()}`),
  );
  page.on("response", (response) => {
    if (response.status() >= 400) {
      problems.push(`${response.status()}: ${response.url()}`);
    }
  });

  await page.goto(`/?scheme=${scheme}`);
  await page.getByTestId("page").waitFor();
  await page.evaluate(() => document.fonts.ready);
  return problems;
}

// Resolves `var(--x)` to a computed colour by letting the browser paint a probe.
async function resolveColorVar(page: Page, variable: string) {
  return page.evaluate((name) => {
    const probe = document.createElement("div");
    probe.style.color = `var(${name})`;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  }, variable);
}

const styleOf = (page: Page, testId: string, property: string) =>
  page
    .getByTestId(testId)
    .evaluate(
      (el, prop) => getComputedStyle(el).getPropertyValue(prop),
      property,
    );

const isTransparent = (color: string) =>
  color === "transparent" || /rgba\(.*,\s*0\)$/.test(color);

for (const scheme of SCHEMES) {
  test.describe(`${scheme} scheme`, () => {
    test("CSS variables resolve on :root", async ({ page }) => {
      await openPage(page, scheme);
      for (const name of [
        "--mb-color-core-brand",
        "--mb-color-text-primary",
        "--mb-default-font-family",
      ]) {
        const value = await page.evaluate(
          (n) => getComputedStyle(document.documentElement).getPropertyValue(n),
          name,
        );
        expect(value.trim(), name).not.toBe("");
      }
    });

    test("components use token values", async ({ page }) => {
      await openPage(page, scheme);

      const brand = await resolveColorVar(page, "--mb-color-core-brand");
      const textPrimary = await resolveColorVar(
        page,
        "--mb-color-text-primary",
      );
      expect(brand).not.toBe(textPrimary);

      // Filled buttons use the button token, which is derived from the brand palette.
      const filledBackground = await resolveColorVar(
        page,
        "--mb-color-button-filled-brand-default",
      );
      expect(filledBackground).not.toBe("");
      expect(await styleOf(page, "button-filled", "background-color")).toBe(
        filledBackground,
      );
      expect(await styleOf(page, "text", "color")).toBe(textPrimary);
      expect(await styleOf(page, "button-filled", "font-family")).toMatch(
        /^"?Lato"?/,
      );

      const radius = await page.getByTestId("button-filled").evaluate((el) => {
        const probe = document.createElement("div");
        probe.style.borderRadius = "var(--mantine-radius-xs)";
        document.body.appendChild(probe);
        const expected = getComputedStyle(probe).borderTopLeftRadius;
        probe.remove();
        return {
          expected,
          actual: getComputedStyle(el).borderTopLeftRadius,
        };
      });
      expect(radius.expected).not.toBe("0px");
      expect(radius.actual).toBe(radius.expected);
    });

    test("overlays are visible with an opaque background", async ({ page }) => {
      await openPage(page, scheme);

      const modal = page.getByRole("dialog");
      await expect(modal).toBeVisible();
      expect(
        isTransparent(
          await modal.evaluate((el) => getComputedStyle(el).backgroundColor),
        ),
      ).toBe(false);

      const select = page.getByTestId("select");
      const listbox = page.getByRole("listbox");
      await expect(listbox).toBeVisible();
      const dropdown = listbox.locator(
        "xpath=ancestor::*[contains(@class, 'dropdown')][1]",
      );
      expect(
        isTransparent(
          await dropdown.evaluate((el) => getComputedStyle(el).backgroundColor),
        ),
      ).toBe(false);
      await expect(select).toBeAttached();

      await expect(page.getByTestId("menu-dropdown")).toBeVisible();
      await expect(page.getByText("Tooltip label")).toBeVisible();
      await expect(page.getByTestId("date-picker")).toBeVisible();
    });

    test("dropdowns are wrapped in the popover element", async ({ page }) => {
      await openPage(page, scheme);
      const wrapped = (testId: string) =>
        page
          .getByTestId(testId)
          .evaluate(
            (el) => el.closest('[data-element-id="mantine-popover"]') != null,
          );

      await expect(page.getByRole("listbox")).toBeVisible();
      const selectWrapped = await page
        .getByRole("listbox")
        .evaluate(
          (el) => el.closest('[data-element-id="mantine-popover"]') != null,
        );
      expect(selectWrapped, "select dropdown").toBe(true);
      expect(await wrapped("menu-dropdown"), "menu dropdown").toBe(true);
    });

    test("overlays have numeric z-indexes and stack above the page", async ({
      page,
    }) => {
      await openPage(page, scheme);
      const zIndexOf = (selector: string) =>
        page
          .locator(selector)
          .first()
          .evaluate((el) => getComputedStyle(el).zIndex);
      const modal = page.getByRole("dialog");
      await expect(modal).toBeVisible();

      const zIndexes = {
        "modal content": await modal.evaluate(
          (el) => getComputedStyle(el).zIndex,
        ),
        "modal overlay": await zIndexOf('[class*="Modal-overlay"]'),
        "select dropdown": await page
          .getByRole("listbox")
          .evaluate(
            (el) =>
              getComputedStyle(
                el.closest('[data-element-id="mantine-popover"]')!,
              ).zIndex,
          ),
      };
      for (const [name, value] of Object.entries(zIndexes)) {
        expect(value, name).toMatch(/^-?\d+$/);
      }

      // The modal and its overlay cover the page's own controls.
      const topmostIsModalLayer = await page
        .getByTestId("scheme-toggle")
        .evaluate((el) => {
          const { x, y, width, height } = el.getBoundingClientRect();
          const top = document.elementFromPoint(x + width / 2, y + height / 2);
          return top != null && !el.contains(top);
        });
      expect(topmostIsModalLayer).toBe(true);
    });

    test("a dropdown opened inside a modal renders above the modal", async ({
      page,
    }) => {
      await openPage(page, scheme);
      const input = page.getByTestId("modal-select");
      await input.click();
      const option = page
        .getByRole("listbox", { name: "Modal select" })
        .getByRole("option", { name: "Alpha" });
      await expect(option).toBeVisible();

      const result = await option.evaluate((el) => {
        const dropdown = el.closest('[data-element-id="mantine-popover"]')!;
        const dialog = document.querySelector('[role="dialog"]')!;
        const { x, y, width, height } = el.getBoundingClientRect();
        const top = document.elementFromPoint(x + width / 2, y + height / 2);
        return {
          dropdownZ: getComputedStyle(dropdown).zIndex,
          dialogZ: getComputedStyle(dialog).zIndex,
          topIsOption: top != null && dropdown.contains(top),
        };
      });
      expect(result.dropdownZ).toMatch(/^-?\d+$/);
      expect(result.dialogZ).toMatch(/^-?\d+$/);
      // Overlays share one z-index; the later portal paints on top.
      expect(Number(result.dropdownZ)).toBeGreaterThanOrEqual(
        Number(result.dialogZ),
      );
      expect(result.topIsOption).toBe(true);
    });

    test("Text uses Lato without an app reset", async ({ page }) => {
      await openPage(page, scheme);
      expect(await styleOf(page, "text", "font-family")).toMatch(/^"?Lato/);
    });

    test("body gets Mantine's baseline", async ({ page }) => {
      await openPage(page, scheme);
      const body = await page.evaluate(() => {
        const resolve = (
          property: "color" | "backgroundColor" | "fontSize",
          variable: string,
        ) => {
          const probe = document.createElement("div");
          probe.style[property] = `var(${variable})`;
          document.body.appendChild(probe);
          const value = getComputedStyle(probe)[property];
          probe.remove();
          return value;
        };
        const style = getComputedStyle(document.body);
        return {
          margin: style.margin,
          backgroundColor: style.backgroundColor,
          color: style.color,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          expectedBackground: resolve(
            "backgroundColor",
            "--mb-color-background_page-secondary",
          ),
          expectedColor: resolve("color", "--mb-color-text-primary"),
          expectedFontSize: resolve("fontSize", "--mantine-font-size-md"),
        };
      });
      expect(body.margin).toBe("0px");
      expect(body.backgroundColor).toBe(body.expectedBackground);
      expect(isTransparent(body.backgroundColor)).toBe(false);
      expect(body.color).toBe(body.expectedColor);
      expect(body.fontFamily).toMatch(/^"?Lato/);
      expect(body.fontSize).toBe(body.expectedFontSize);
      expect(body.fontSize).toBe("14px");
    });

    test("inputs do not overflow their container", async ({ page }) => {
      await openPage(page, scheme);
      for (const id of ["text-input", "select"]) {
        const { right, containerRight } = await page
          .getByTestId(id)
          .evaluate((el) => ({
            right: el.getBoundingClientRect().right,
            containerRight: el.parentElement!.getBoundingClientRect().right,
          }));
        expect(right, id).toBeLessThanOrEqual(containerRight);
      }
      // The theme's `rem()` sizes only resolve when PostCSS processes the CSS.
      const height = await page
        .getByTestId("text-input")
        .evaluate((el) => el.getBoundingClientRect().height);
      expect(height).toBeGreaterThanOrEqual(40);
    });

    test("overlay and picker text uses Lato", async ({ page }) => {
      await openPage(page, scheme);
      const targets = {
        "modal title": page.getByRole("dialog").getByText("Modal title"),
        tooltip: page.getByText("Tooltip label"),
        badge: page.getByTestId("badge"),
        "select option": page.getByRole("option", { name: "One" }),
        "date picker weekday": page
          .getByTestId("date-picker")
          .locator("th")
          .first(),
      };
      for (const [name, locator] of Object.entries(targets)) {
        await expect(locator, name).toBeVisible();
        expect(
          await locator.evaluate((el) => getComputedStyle(el).fontFamily),
          name,
        ).toMatch(/^"?Lato/);
      }
    });

    test("icons render svg with a size", async ({ page }) => {
      await openPage(page, scheme);
      for (const id of ["icon-table", "icon-database", "icon-search"]) {
        const box = await page.getByTestId(id).boundingBox();
        expect(box?.width, id).toBeGreaterThan(0);
        expect(box?.height, id).toBeGreaterThan(0);
        expect(
          await page.getByTestId(id).evaluate((el) => el.tagName.toLowerCase()),
        ).toBe("svg");
      }
    });

    test("Lato loads from fonts.css", async ({ page }) => {
      await openPage(page, scheme);
      const loaded = await page.evaluate(async () => {
        await document.fonts.load("14px Lato");
        await document.fonts.ready;
        // `check` is also true when no @font-face matches, so look at the faces too.
        const faces = [...document.fonts].filter((f) =>
          f.family.replace(/"/g, "").startsWith("Lato"),
        );
        return {
          check: document.fonts.check("14px Lato"),
          loadedFaces: faces.filter((f) => f.status === "loaded").length,
        };
      });
      expect(loaded.check).toBe(true);
      expect(loaded.loadedFaces).toBeGreaterThan(0);
    });

    test("no console errors or failed requests; screenshot", async ({
      page,
    }, testInfo) => {
      const problems = await openPage(page, scheme);
      // Let the modal and tooltip finish their enter transitions.
      await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1");
      await expect(page.getByText("Tooltip label")).toBeVisible();
      await page.evaluate(() =>
        Promise.all(document.getAnimations().map((a) => a.finished)),
      );
      mkdirSync(ARTIFACTS_DIR, { recursive: true });
      await page.screenshot({
        path: `${ARTIFACTS_DIR}/host-app-${testInfo.project.name}-${scheme}.png`,
        fullPage: true,
      });
      expect(problems).toEqual([]);
    });
  });
}
