import type { Location } from "history";
import { push } from "react-router-redux";
import { t } from "ttag";

import { resetConversation } from "metabase/metabot/state";
import { useDispatch, useSelector } from "metabase/redux";
import { getSetting } from "metabase/selectors/settings";
import { Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { IconName } from "metabase-types/api";

import { SidebarLink } from "../../MainNavbar/SidebarItems";
import S from "../ProtoNavbar.module.css";
import { getLastNewQueryMode, newQueryUrl } from "../newQuery";
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

function withFreshParam(url: string) {
  const fresh = `fresh=${Date.now()}`;
  const hashIndex = url.indexOf("#");
  const pathPart = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const hashPart = hashIndex === -1 ? "" : url.slice(hashIndex);
  const withFresh = pathPart.includes("?")
    ? `${pathPart}&${fresh}`
    : `${pathPart}?${fresh}`;
  return `${withFresh}${hashPart}`;
}

export function ExploreSection({ location, onPin }: Props) {
  const dispatch = useDispatch();
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

  const historyUrlFor = (icon: IconName) => {
    if (icon === "sql") {
      return sqlQueryUrl;
    }
    if (icon === "notebook") {
      return "/question/notebook";
    }
    return "/question/ask";
  };

  const handleNewQuery = () => {
    dispatch(resetConversation({ agentId: "ask" }));
    dispatch(
      push(
        withFreshParam(
          newQueryUrl(getLastNewQueryMode(), {
            databaseId: lastUsedDatabaseId ?? undefined,
          }),
        ),
      ),
    );
    onPin();
  };

  const isNewQuerySelected =
    path === "/question/new" || path.startsWith("/question/new/");

  return (
    <>
      <SubNavSection>
        <button
          type="button"
          className={`${S.navActionButton} ${S.newQueryButton}`}
          aria-label={t`New query`}
          aria-current={isNewQuerySelected ? "page" : undefined}
          onClick={handleNewQuery}
        >
          <span className={S.navActionIconCircle}>
            <Icon name="add" size={12} />
          </span>
          {t`New query`}
        </button>
      </SubNavSection>

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
    </>
  );
}
