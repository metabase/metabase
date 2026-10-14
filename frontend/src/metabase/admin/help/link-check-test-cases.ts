import { useDocsUrl } from "metabase/common/hooks";
import type { State } from "metabase/redux/store";
import { getDocsUrl } from "metabase/selectors/settings";

export const useLinkCheckTestCases = (state: State) => [
  useDocsUrl("questions/no-such-page-gro-1061").url,
  getDocsUrl(state, {
    page: "questions/alerts",
    anchor: "no-such-heading-gro-1061",
  }),
  "https://www.metabase.com/docs/latest/questions/no-such-page-gro-1061",
  "https://www.metabase.com/docs/latest/questions/sharing/alerts",
  "https://www.metabase.com/docs/latest/questions/alerts#no-such-heading-gro-1061",
];
