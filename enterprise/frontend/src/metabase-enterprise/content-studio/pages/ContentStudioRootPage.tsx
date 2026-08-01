import type { ContentStudioSection } from "metabase/content-studio/app/pages/ContentStudioLayout";

import { ContentView } from "../components/ContentView";

type ContentStudioRootPageProps = {
  section: ContentStudioSection;
};

/** The root of a namespace, listing what sits directly under it. */
export function ContentStudioRootPage({ section }: ContentStudioRootPageProps) {
  return <ContentView target={{ kind: "root", section }} />;
}
