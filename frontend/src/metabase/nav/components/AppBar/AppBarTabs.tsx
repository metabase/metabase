import { useLocation } from "react-use";
import { t } from "ttag";

import { ProfileLink } from "../ProfileLink";
import { SearchBar } from "../search/SearchBar";

import { AppBarLogo } from "./AppBarLogo";

export interface AppBarTabsProps {
  currentUser: any;
  isNavBarOpen?: boolean;
  isNavBarEnabled?: boolean;
  isMetabotVisible?: boolean;
  isLogoVisible?: boolean;
  isSearchVisible?: boolean;
  isEmbeddingIframe?: boolean;
  isNewButtonVisible?: boolean;
  isProfileLinkVisible?: boolean;
  isCollectionPathVisible?: boolean;
  isQuestionLineageVisible?: boolean;
  onToggleNavbar: () => void;
  onCloseNavbar: () => void;
  onLogout: () => void;
  onChangeLocation: (location: any) => void;
}

const AppBarTabs = ({
  isLogoVisible,
  isNavBarEnabled,
  isSearchVisible,
  isEmbeddingIframe,
  isNewButtonVisible,
  isProfileLinkVisible,
  onLogout,
  onChangeLocation,
}: AppBarTabsProps): JSX.Element => {
  const location = useLocation();
  const pathname = location?.pathname || "";

  const isLibraryActive = pathname.startsWith("/collection") ||
                         pathname.startsWith("/browse") ||
                         pathname.startsWith("/trash");
  const isQuestionsActive = pathname.startsWith("/questions") ||
                           pathname.startsWith("/question") ||
                           pathname.startsWith("/model") ||
                           pathname.startsWith("/metric") ||
                           (!isLibraryActive && !pathname.startsWith("/dashboard"));

  const handleTabClick = (tab: string) => {
    if (tab === "questions") {
      onChangeLocation("/questions");
    } else if (tab === "library") {
      onChangeLocation("/collection/root");
    }
  };

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "1rem",
      height: "64px",
      paddingLeft: "1.325rem",
      paddingRight: "1rem",
      borderBottom: "1px solid var(--mb-color-border)",
      backgroundColor: "var(--mb-color-bg-white)",
    }}>
      <div style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
        <AppBarLogo
          isLogoVisible={isLogoVisible}
          isNavBarEnabled={isNavBarEnabled}
        />
        <div style={{ display: "flex", alignItems: "center", marginLeft: "2rem", marginRight: "1rem", gap: "0.5rem" }}>
          <button
            style={{
              background: isQuestionsActive ? "var(--mb-color-brand)" : "transparent",
              color: isQuestionsActive ? "white" : "var(--mb-color-text-medium)",
              border: "none",
              fontWeight: 600,
              padding: "0.75rem 1.5rem",
              borderRadius: "0.375rem",
              cursor: "pointer",
            }}
            onClick={() => handleTabClick("questions")}
          >
            {t`Questions`}
          </button>
          <button
            style={{
              background: isLibraryActive ? "var(--mb-color-brand)" : "transparent",
              color: isLibraryActive ? "white" : "var(--mb-color-text-medium)",
              border: "none",
              fontWeight: 600,
              padding: "0.75rem 1.5rem",
              borderRadius: "0.375rem",
              cursor: "pointer",
            }}
            onClick={() => handleTabClick("library")}
          >
            {t`Library`}
          </button>
        </div>
      </div>
      {(isSearchVisible || isNewButtonVisible || isProfileLinkVisible) && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {isSearchVisible &&
            (isEmbeddingIframe ? (
              <SearchBar />
            ) : (
              <div>{t`Search Button`}</div>
            ))}
          {isProfileLinkVisible && (
            <div aria-label={t`Settings menu`}>
              <ProfileLink onLogout={onLogout} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AppBarTabs;
