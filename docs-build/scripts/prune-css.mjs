#!/usr/bin/env node
// prune-css.mjs
//
// Removes selectors from chrome.css that reference any class in the
// hand-curated KILL_LIST below. The list is intentionally conservative —
// only Bootstrap subset classes (button variants, button groups, input
// groups, modals, dropdowns, etc.) that header.html / footer.html clearly
// don't use, verified against the audit-css-usage.mjs output.
//
// Run: node docs-build/scripts/prune-css.mjs
//
// Re-run after audit-css-usage.mjs flags new orphan categories. Visually
// smoke-test the docs (header + footer + promo banner) after every prune.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME_CSS = path.resolve(__dirname, "../src/styles/chrome.css");

// Hand-curated. Each entry is a class name that, if present in a selector,
// is enough reason to drop that selector. Grouped by Bootstrap component
// family for review. DO NOT add classes that get toggled dynamically by
// public/js/*.js — re-run audit-css-usage.mjs after editing the JS instead.
const KILL_LIST = new Set([
  // Bootstrap btn color/style variants — header.html only uses .btn /
  // .btn-transparent, never the colored/outlined/solid variants.
  "btn-secondary",
  "btn-success",
  "btn-info",
  "btn-warning",
  "btn-danger",
  "btn-light",
  "btn-dark",
  "btn-link",
  "btn-base",
  "btn-subtle",
  "btn-outline-primary",
  "btn-outline-secondary",
  "btn-outline-success",
  "btn-outline-info",
  "btn-outline-warning",
  "btn-outline-danger",
  "btn-outline-light",
  "btn-outline-dark",
  "btn-outline-white",
  "btn-outline-blue",
  "btn-outline-blue-solid",
  "btn-primary-blue",
  "btn-primary-yellow",
  "btn-primary-green",
  "btn-primary-purple",
  "btn-blue-40",

  // Bootstrap btn-group + check-toggle (radio/checkbox as buttons).
  "btn-check",
  "btn-group",
  "btn-group-vertical",
  "btn-group-sm",
  "btn-group-lg",

  // Bootstrap input groups.
  "input-group",
  "input-group-sm",
  "input-group-lg",
  "input-group-text",
  "input-group-prepend",
  "input-group-append",

  // Bootstrap form validation states.
  "was-validated",
  "is-invalid",
  "is-valid",
  "invalid-feedback",
  "valid-feedback",
  "invalid-tooltip",
  "valid-tooltip",

  // Bootstrap modals.
  "modal",
  "modal-dialog",
  "modal-content",
  "modal-header",
  "modal-body",
  "modal-footer",
  "modal-title",
  "modal-backdrop",
  "modal-fullscreen",
  "modal-fullscreen-sm-down",
  "modal-fullscreen-md-down",
  "modal-fullscreen-lg-down",
  "modal-fullscreen-xl-down",
  "modal-fullscreen-xxl-down",
  "modal-dialog-scrollable",
  "modal-dialog-centered",
  "modal-sm",
  "modal-lg",
  "modal-xl",

  // Bootstrap toasts.
  "toast",
  "toast-container",
  "toast-header",
  "toast-body",

  // Bootstrap accordion (header.html uses native <details>, not the
  // Bootstrap accordion component).
  "accordion",
  "accordion-item",
  "accordion-header",
  "accordion-button",
  "accordion-body",
  "accordion-collapse",
  "accordion-flush",

  // Bootstrap carousel.
  "carousel",
  "carousel-inner",
  "carousel-item",
  "carousel-item-next",
  "carousel-item-prev",
  "carousel-item-start",
  "carousel-item-end",
  "carousel-control-prev",
  "carousel-control-next",
  "carousel-control-prev-icon",
  "carousel-control-next-icon",
  "carousel-indicators",
  "carousel-caption",
  "carousel-fade",
  "carousel-dark",

  // Bootstrap dropdowns — our nav uses bespoke .nav-menu / [id$=nav-menu-wrapper]
  // markup, never Bootstrap's .dropdown / .dropdown-menu primitives.
  "dropdown",
  "dropdown-toggle",
  "dropdown-toggle-split",
  "dropdown-menu",
  "dropdown-menu-sm",
  "dropdown-menu-md",
  "dropdown-menu-lg",
  "dropdown-menu-start",
  "dropdown-menu-end",
  "dropdown-menu-dark",
  "dropdown-item",
  "dropdown-item-text",
  "dropdown-header",
  "dropdown-divider",
  "dropup",
  "dropend",
  "dropstart",

  // Bootstrap pagination.
  "pagination",
  "page-link",
  "page-item",
  "pagination-sm",
  "pagination-lg",

  // Bootstrap progress bar.
  "progress",
  "progress-bar",
  "progress-bar-striped",
  "progress-bar-animated",

  // Bootstrap list-group.
  "list-group",
  "list-group-item",
  "list-group-item-action",
  "list-group-flush",
  "list-group-horizontal",
  "list-group-horizontal-sm",
  "list-group-horizontal-md",
  "list-group-horizontal-lg",
  "list-group-horizontal-xl",
  "list-group-horizontal-xxl",
  "list-group-numbered",

  // Bootstrap close button.
  "btn-close",
  "btn-close-white",

  // Bootstrap spinners.
  "spinner-border",
  "spinner-border-sm",
  "spinner-grow",
  "spinner-grow-sm",

  // Bootstrap nav/tabs/pills (header.html uses bespoke nav primitives).
  "nav",
  "nav-link",
  "nav-tabs",
  "nav-pills",
  "nav-fill",
  "nav-justified",
  "tab-content",
  "tab-pane",

  // Bootstrap navbar primitives — header.html doesn't use these.
  "navbar",
  "navbar-brand",
  "navbar-nav",
  "navbar-collapse",
  "navbar-toggler",
  "navbar-toggler-icon",
  "navbar-text",
  "navbar-light",
  "navbar-dark",
  "navbar-expand",
  "navbar-expand-sm",
  "navbar-expand-md",
  "navbar-expand-lg",
  "navbar-expand-xl",
  "navbar-expand-xxl",

  // Bootstrap card.
  "card",
  "card-body",
  "card-title",
  "card-subtitle",
  "card-text",
  "card-link",
  "card-header",
  "card-footer",
  "card-img",
  "card-img-top",
  "card-img-bottom",
  "card-img-overlay",
  "card-group",

  // Bootstrap typography classes (.h1 .. .h6 — the class form, NOT the tag).
  // Bootstrap's CSS uses BOTH `h1` (tag) and `.h1` (class) so styles apply
  // when a non-heading element is given the class. header.html never uses
  // these class forms.
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",

  // Bootstrap responsive container sizes (header.html only uses bare
  // .container).
  "container-sm",
  "container-md",
  "container-lg",
  "container-xl",
  "container-xxl",
  "container-fluid",

  // Bootstrap form-* controls header.html doesn't use.
  "form-check",
  "form-check-input",
  "form-check-label",
  "form-check-inline",
  "form-switch",
  "form-select",
  "form-select-sm",
  "form-select-lg",
  "form-range",
  "form-floating",
  "form-text",
  "form-label",
  "col-form-label",
  "col-form-label-sm",
  "col-form-label-lg",
  "form-control-sm",
  "form-control-lg",
  "form-control-plaintext",
  "form-control-color",

  // Bootstrap dropdown's "open" sibling `.show` — only used by the dropdown
  // family above, never standalone in our chrome.
  "show",

  // Bootstrap colored backgrounds the chrome doesn't display.
  "bg-primary",
  "bg-secondary",
  "bg-success",
  "bg-info",
  "bg-warning",
  "bg-danger",
  "bg-light",
  "bg-dark",
  "bg-body",
  "bg-transparent",

  // Bootstrap colored borders the chrome doesn't display.
  "border-primary",
  "border-secondary",
  "border-success",
  "border-info",
  "border-warning",
  "border-danger",
  "border-light",
  "border-dark",
  "border-white",

  // Bootstrap text-bg-* compound utilities.
  "text-bg-primary",
  "text-bg-secondary",
  "text-bg-success",
  "text-bg-info",
  "text-bg-warning",
  "text-bg-danger",
  "text-bg-light",
  "text-bg-dark",

  // Bootstrap colored text the chrome doesn't display.
  "text-primary",
  "text-secondary",
  "text-success",
  "text-info",
  "text-warning",
  "text-danger",
  "text-light",
  "text-dark",
  "text-body",
  "text-white",
  "text-muted",
  "text-black-50",
  "text-white-50",
  "text-reset",

  // Bootstrap alert variants. Our promo-banner is bespoke, not .alert.
  "alert",
  "alert-primary",
  "alert-secondary",
  "alert-success",
  "alert-info",
  "alert-warning",
  "alert-danger",
  "alert-light",
  "alert-dark",
  "alert-link",
  "alert-dismissible",
  "alert-heading",

  // Bootstrap badge variants — chrome.css carries its own bespoke .badge
  // rule near the menu items; the Bootstrap color/pill variants aren't used.
  "badge-primary",
  "badge-secondary",
  "badge-success",
  "badge-info",
  "badge-warning",
  "badge-danger",
  "badge-light",
  "badge-dark",
  "badge-pill",

  // Bootstrap visually-hidden helpers (we don't toggle these in chrome).
  "visually-hidden-focusable",

  // Bootstrap ratio helpers (chrome doesn't use aspect-ratio boxes).
  "ratio",
  "ratio-1x1",
  "ratio-4x3",
  "ratio-16x9",
  "ratio-21x9",

  // Bootstrap object-fit utilities.
  "object-fit-contain",
  "object-fit-cover",
  "object-fit-fill",
  "object-fit-scale",
  "object-fit-none",

  // Bootstrap responsive-table helpers.
  "table",
  "table-sm",
  "table-bordered",
  "table-borderless",
  "table-striped",
  "table-hover",
  "table-active",
  "table-light",
  "table-dark",
  "table-primary",
  "table-secondary",
  "table-success",
  "table-info",
  "table-warning",
  "table-danger",
  "table-responsive",
  "table-responsive-sm",
  "table-responsive-md",
  "table-responsive-lg",
  "table-responsive-xl",
  "table-responsive-xxl",
  "caption-top",

  // Bootstrap figure helpers.
  "figure",
  "figure-img",
  "figure-caption",

  // Bootstrap link-* / link-offset utilities.
  "link-primary",
  "link-secondary",
  "link-success",
  "link-info",
  "link-warning",
  "link-danger",
  "link-light",
  "link-dark",

  // Bootstrap blockquote helpers.
  "blockquote",
  "blockquote-footer",
]);

const CLASS_NAME_IN_SELECTOR_RE = /\.([A-Za-z_][\w-]*)/g;

function shouldKeepSelector(selector) {
  const classes = [];
  for (const m of selector.matchAll(CLASS_NAME_IN_SELECTOR_RE)) {
    classes.push(m[1]);
  }
  return !classes.some((c) => KILL_LIST.has(c));
}

function processLine(line) {
  // Skip comments and at-rule-only lines.
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("/*") || trimmed.startsWith("@") || !trimmed.includes("{")) {
    return { line, dropped: 0 };
  }
  const braceIdx = line.indexOf("{");
  const selectorPart = line.slice(0, braceIdx);
  const bodyPart = line.slice(braceIdx);
  const groups = selectorPart.split(",");
  const keptGroups = groups.filter((g) => shouldKeepSelector(g));
  const dropped = groups.length - keptGroups.length;
  if (keptGroups.length === 0) {
    return { line: null, dropped };
  }
  if (dropped === 0) return { line, dropped: 0 };
  // Rebuild the line with only the kept groups, preserving the indent.
  const indent = line.match(/^\s*/)[0];
  return { line: indent + keptGroups.map((g) => g.trim()).join(",") + bodyPart, dropped };
}

function main() {
  const src = fs.readFileSync(CHROME_CSS, "utf8");
  const lines = src.split("\n");
  const out = [];
  let totalLinesDropped = 0;
  let totalSelectorsDropped = 0;
  for (const line of lines) {
    const { line: newLine, dropped } = processLine(line);
    totalSelectorsDropped += dropped;
    if (newLine === null) {
      totalLinesDropped++;
      continue;
    }
    out.push(newLine);
  }
  const newSrc = out.join("\n");
  fs.writeFileSync(CHROME_CSS, newSrc);
  console.log(
    `prune-css: dropped ${totalLinesDropped} lines, ${totalSelectorsDropped} selectors`,
  );
  console.log(`  before: ${lines.length} lines`);
  console.log(`  after:  ${out.length} lines`);
}

main();
