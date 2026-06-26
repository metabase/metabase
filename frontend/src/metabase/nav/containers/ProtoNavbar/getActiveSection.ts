export type SectionId =
  | "collections"
  | "explore"
  | "library"
  | "data"
  | "monitor";

// Maps the current URL to the nav section that should appear selected.
// Returns null when the route doesn't clearly belong to a section so the
// previously selected section stays put.
export function getActiveSection(pathname: string): SectionId | null {
  if (
    pathname.startsWith("/data-studio/data") ||
    pathname.startsWith("/data-studio/transforms") ||
    pathname.startsWith("/data-studio/schema-viewer")
  ) {
    return "data";
  }
  if (
    pathname.startsWith("/data-studio/dependencies") ||
    pathname.startsWith("/data-studio/dependency-diagnostics") ||
    pathname.startsWith("/admin/tools")
  ) {
    return "monitor";
  }
  if (pathname.startsWith("/data-studio")) {
    return "library";
  }
  if (
    pathname.startsWith("/metabot") ||
    pathname.startsWith("/explore") ||
    pathname.startsWith("/question/ask")
  ) {
    return "explore";
  }
  if (
    pathname === "/" ||
    pathname.startsWith("/collection") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/question") ||
    pathname.startsWith("/model") ||
    pathname.startsWith("/metric") ||
    pathname.startsWith("/browse") ||
    pathname.startsWith("/document") ||
    pathname.startsWith("/trash")
  ) {
    return "collections";
  }
  return null;
}
