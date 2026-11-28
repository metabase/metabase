import { t } from "ttag";

import { useQuestionFromOptsBuilder } from "metabase/metadata-store";
import { useSelector } from "metabase/redux";
import type { Location } from "metabase/router";
import { getSetting } from "metabase/settings";
import * as Urls from "metabase/urls";
import type { IconName } from "metabase-types/api";

import { SidebarLink } from "../../MainNavbar/SidebarItems";
import S from "../ProtoNavbar.module.css";
import { SubNavHeading, SubNavSection } from "../SubNav";

import { CollectionsSection } from "./CollectionsSection";

type Props = {
  isOpen: boolean;
  location: Location;
  params: { slug?: string; pageId?: string };
  // Lets this section keep itself selected when a click navigates to a route
  // that would otherwise map to a different section.
  onPin: () => void;
};

type HistoryItem = { id: string; label: string; icon: IconName };

// History is faked for now — these would become real AI conversations and
// ad hoc queries.
const FAKE_HISTORY: HistoryItem[] = [
  { id: "h1", label: "Revenue by region last quarter", icon: "sparkles" },
  { id: "h2", label: "Why did signups dip in March?", icon: "sparkles" },
  { id: "h3", label: "Untitled SQL query", icon: "sql" },
  { id: "h4", label: "Orders joined with customers", icon: "notebook" },
];

export function ExploreSection({ isOpen, location, params, onPin }: Props) {
  const buildQuestion = useQuestionFromOptsBuilder();

  const lastUsedDatabaseId = useSelector((state) =>
    getSetting(state, "last-used-native-database-id"),
  );
  const sqlQueryUrl = Urls.newQuestion(
    buildQuestion({
      DEPRECATED_RAW_MBQL_type: "native",
      cardType: "question",
      DEPRECATED_RAW_MBQL_databaseId: lastUsedDatabaseId || undefined,
    }),
    { creationType: "native_question" },
  );

  const historyUrlFor = (icon: IconName) => {
    if (icon === "sql") {
      return sqlQueryUrl;
    }
    if (icon === "notebook") {
      return "/question/notebook";
    }
    return "/question/ask";
  };

  return (
    <>
      {/* Create, collections, bookmarks. */}
      <CollectionsSection isOpen={isOpen} location={location} params={params} />
      <div className={S.appendedSection}>
        <SubNavSection>
          <SubNavHeading>{t`History`}</SubNavHeading>
          {FAKE_HISTORY.map((item) => (
            <SidebarLink
              key={item.id}
              icon={item.icon}
              url={historyUrlFor(item.icon)}
              onClick={onPin}
            >
              {item.label}
            </SidebarLink>
          ))}
        </SubNavSection>
      </div>
    </>
  );
}
