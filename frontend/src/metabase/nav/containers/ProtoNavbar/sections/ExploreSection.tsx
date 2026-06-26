import type { Location } from "history";
import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { getSetting } from "metabase/selectors/settings";
import * as Urls from "metabase/urls";
import type { IconName } from "metabase-types/api";

import { SidebarLink } from "../../MainNavbar/SidebarItems";
import { SubNavHeading, SubNavSection } from "../SubNav";

type Props = { location: Location };

// History is faked for now — these would become real AI conversations and
// ad hoc queries.
const FAKE_HISTORY: { label: string; icon: IconName }[] = [
  { label: "Revenue by region last quarter", icon: "sparkles" },
  { label: "Why did signups dip in March?", icon: "sparkles" },
  { label: "Untitled SQL query", icon: "sql" },
  { label: "Orders joined with customers", icon: "notebook" },
];

export function ExploreSection({ location }: Props) {
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

  return (
    <>
      <SubNavSection>
        <SubNavHeading>{t`Ask AI`}</SubNavHeading>
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
        <SidebarLink icon="notebook" url="/question/new">
          {t`GUI query`}
        </SidebarLink>
        <SidebarLink icon="sql" url={sqlQueryUrl}>
          {t`SQL query`}
        </SidebarLink>
      </SubNavSection>

      <SubNavSection>
        <SubNavHeading>{t`History`}</SubNavHeading>
        {FAKE_HISTORY.map((item) => (
          <SidebarLink key={item.label} icon={item.icon} url="#">
            {item.label}
          </SidebarLink>
        ))}
      </SubNavSection>
    </>
  );
}
