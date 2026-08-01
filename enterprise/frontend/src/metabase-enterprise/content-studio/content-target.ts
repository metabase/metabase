import { match } from "ts-pattern";
import { t } from "ttag";

import type { ContentStudioSection } from "metabase/content-studio/app/pages/ContentStudioLayout";
import type { Collection, CollectionId, IconName } from "metabase-types/api";

/**
 * What the Content Studio content view is showing: a collection, or the root of
 * a namespace, which has no collection of its own to load.
 */
export type ContentStudioTarget =
  | { kind: "collection"; collection: Collection }
  | { kind: "root"; section: ContentStudioSection };

export function getCollectionSection(
  collection: Pick<Collection, "namespace">,
): ContentStudioSection {
  return match<Collection["namespace"], ContentStudioSection>(
    collection.namespace,
  )
    .with("transforms", () => "transforms")
    .with("snippets", () => "snippets")
    .otherwise(() => "collections");
}

export function getTargetSection(
  target: ContentStudioTarget,
): ContentStudioSection {
  return target.kind === "root"
    ? target.section
    : getCollectionSection(target.collection);
}

/** The collection whose contents are listed; `null` is a namespace root. */
export function getTargetCollectionId(
  target: ContentStudioTarget,
): CollectionId | null {
  return target.kind === "collection" ? target.collection.id : null;
}

export function getSectionTitle(section: ContentStudioSection): string {
  return match(section)
    .with("collections", () => t`Collections`)
    .with("transforms", () => t`Transforms`)
    .with("snippets", () => t`SQL snippets`)
    .exhaustive();
}

export function getSectionIcon(section: ContentStudioSection): IconName {
  return match<ContentStudioSection, IconName>(section)
    .with("collections", () => "folder")
    .with("transforms", () => "transform")
    .with("snippets", () => "snippet")
    .exhaustive();
}
