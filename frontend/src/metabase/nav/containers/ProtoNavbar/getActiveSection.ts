export type SectionId = "home" | "explore" | "data" | "monitor";

// Lets navigations from outside ProtoNavbar (e.g. opening a table question
// from the Data tab) keep the rail on the originating section.
let pendingSectionPin: SectionId | null = null;

export function pinProtoNavSection(section: SectionId) {
  pendingSectionPin = section;
}

export function consumeProtoNavSectionPin(): SectionId | null {
  const section = pendingSectionPin;
  pendingSectionPin = null;
  return section;
}

// Maps the current URL to the nav section that should appear selected.
// Returns null when the route doesn't clearly belong to a section so the
// previously selected section stays put. Content routes map to Explore;
// ProtoNavbar promotes synced collections to Home.
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
    pathname.startsWith("/monitor")
  ) {
    return "monitor";
  }
  // The semantic layer (published tables, metrics) lives on the Home tab;
  // other Data Studio pages (e.g. glossary, events) have no tab of their own.
  if (pathname === "/" || pathname.startsWith("/data-studio")) {
    return "home";
  }
  if (
    pathname.startsWith("/metabot") ||
    pathname.startsWith("/explore") ||
    pathname.startsWith("/collection") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/question") ||
    pathname.startsWith("/model") ||
    pathname.startsWith("/metric") ||
    pathname.startsWith("/browse") ||
    pathname.startsWith("/document") ||
    pathname.startsWith("/trash")
  ) {
    return "explore";
  }
  return null;
}
