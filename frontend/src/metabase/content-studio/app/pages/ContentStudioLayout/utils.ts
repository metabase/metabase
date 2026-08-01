import { P, match } from "ts-pattern";

import * as Urls from "metabase/urls";

export type ContentStudioSection = "collections" | "transforms" | "snippets";

export function getCurrentSection(
  pathname: string,
): ContentStudioSection | null {
  return match(pathname)
    .returnType<ContentStudioSection | null>()
    .with(
      P.string.startsWith(Urls.contentStudioTransforms()),
      () => "transforms",
    )
    .with(P.string.startsWith(Urls.contentStudioSnippets()), () => "snippets")
    .with(
      P.string.startsWith(Urls.contentStudioCollections()),
      P.string.startsWith(`${Urls.contentStudio()}/collection/`),
      P.string.startsWith(`${Urls.contentStudio()}/question/`),
      () => "collections",
    )
    .otherwise(() => null);
}
