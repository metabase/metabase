import type { Location } from "history";
import { useState } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { getSetting } from "metabase/selectors/settings";
import * as Urls from "metabase/urls";
import type { IconName } from "metabase-types/api";

import { SidebarLink } from "../../MainNavbar/SidebarItems";
import { SubNavHeading, SubNavSection } from "../SubNav";

type Props = {
  location: Location;
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

export function ExploreSection({ location, onPin }: Props) {
  const path = location.pathname;

  const lastUsedDatabaseId = useSelector((state) =>
    getSetting(state, "last-used-native-database-id"),
  );
  const sqlQueryUrl = Urls.newQuestion({
    DEPRECATED_RAW_MBQL_type: "native",
    creationType: "native_question",
    cardType: "question",
    DEPRECATED_RAW_MBQL_databaseId: lastUsedDatabaseId || undefined,
  });

  // Stubbed history entries added by clicking "GUI query". They live only while
  // the Explore section is mounted, so they vanish when the user leaves it.
  const [stubbedHistory, setStubbedHistory] = useState<HistoryItem[]>([]);
  const handleGuiQuery = () => {
    setStubbedHistory((prev) => [
      { id: `gui-${Date.now()}`, label: t`New GUI query`, icon: "notebook" },
      ...prev,
    ]);
  };

  const history = [...stubbedHistory, ...FAKE_HISTORY];

  // History entries reopen the editor that matches their type, staying within
  // the Explore section.
  const historyUrlFor = (icon: IconName) => {
    if (icon === "sql") {
      return sqlQueryUrl;
    }
    if (icon === "notebook") {
      return "/question/new";
    }
    return "/question/ask";
  };

  return (
    <>
      <SubNavSection>
        <SubNavHeading>{t`AI explorations`}</SubNavHeading>
        <SidebarLink
          icon="sparkles"
          url="/question/ask"
          isSelected={path.startsWith("/question/ask")}
        >
          {t`Ask a question`}
        </SidebarLink>
        <SidebarLink icon="insight" url="/metabot/research">
          {t`Research`}
        </SidebarLink>
      </SubNavSection>

      <SubNavSection>
        <SubNavHeading>{t`Query`}</SubNavHeading>
        <SidebarLink
          icon="metric"
          url={Urls.metricsViewer()}
          isSelected={path.startsWith("/explore")}
        >
          {t`Metric explorer`}
        </SidebarLink>
        <SidebarLink
          icon="notebook"
          url="/question/new"
          onClick={() => {
            handleGuiQuery();
            onPin();
          }}
        >
          {t`Query builder`}
        </SidebarLink>
        <SidebarLink icon="sql" url={sqlQueryUrl} onClick={onPin}>
          {t`SQL editor`}
        </SidebarLink>
      </SubNavSection>

      <SubNavSection>
        <SubNavHeading>{t`History`}</SubNavHeading>
        {history.map((item) => (
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
    </>
  );
}
