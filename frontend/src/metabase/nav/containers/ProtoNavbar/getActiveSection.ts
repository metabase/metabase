import { extractCollectionIdFromPath } from "metabase/urls/collections";
import type { CollectionId } from "metabase-types/api";

import { isCollectionPath } from "../MainNavbar/getSelectedItems";

export type SectionId =
  | "collections"
  | "library"
  | "data"
  | "playground"
  | "monitor";

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
// previously selected section stays put.
export function getActiveSection(
  pathname: string,
  personalCollectionId?: CollectionId | null,
): SectionId | null {
  if (
    pathname.startsWith("/browse/databases") ||
    pathname.startsWith("/data-studio/data") ||
    pathname.startsWith("/data-studio/transforms") ||
    pathname.startsWith("/data-studio/schema-viewer") ||
    pathname.startsWith("/data-studio/workspaces")
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
    personalCollectionId != null &&
    isCollectionPath(pathname) &&
    extractCollectionIdFromPath(pathname) === personalCollectionId
  ) {
    return "playground";
  }
  if (
    pathname.startsWith("/metabot") ||
    pathname.startsWith("/explore") ||
    pathname.startsWith("/question/ask")
  ) {
    return null;
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
