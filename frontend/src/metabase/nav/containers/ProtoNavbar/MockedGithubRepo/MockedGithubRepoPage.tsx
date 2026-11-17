/* eslint-disable i18next/no-literal-string, metabase/no-color-literals -- PROTOTYPE: a static mock of a third-party (GitHub) page */
import type { ReactNode } from "react";

import S from "./MockedGithubRepoPage.module.css";

// PROTOTYPE: mocked. A static stand-in for the GitHub repository that remote
// sync publishes from (Figma "1. GitHub repo", node 5:2).

type TreeEntry = {
  name: string;
  type: "folder" | "file";
  message: string;
  updated: string;
};

const TREE: TreeEntry[] = [
  {
    name: "Dashboards",
    type: "folder",
    message: "Add Q4 pipeline review dashboard",
    updated: "2 hours ago",
  },
  {
    name: "Data apps",
    type: "folder",
    message: "Fix filter wiring in support triage app",
    updated: "yesterday",
  },
  {
    name: "Metrics",
    type: "folder",
    message: "Rename ARR metric to match glossary",
    updated: "3 days ago",
  },
  {
    name: "Published tables",
    type: "folder",
    message: "Publish dim_accounts and fct_orders",
    updated: "last week",
  },
  {
    name: "SQL snippets",
    type: "folder",
    message: "Add active-customer filter snippet",
    updated: "last week",
  },
  {
    name: "Python snippets",
    type: "folder",
    message: "Add cohort retention helper",
    updated: "2 weeks ago",
  },
  {
    name: "Transforms",
    type: "folder",
    message: "Schedule monthly orders rollup",
    updated: "2 weeks ago",
  },
  {
    name: "Glossary",
    type: "folder",
    message: "Define churn and net revenue retention",
    updated: "3 weeks ago",
  },
  {
    name: ".gitignore",
    type: "file",
    message: "Initial commit",
    updated: "4 months ago",
  },
  {
    name: "README.md",
    type: "file",
    message: "Document the folder layout",
    updated: "last month",
  },
];

const REPO_TABS: { label: string; count?: number; icon?: ReactNode }[] = [
  { label: "Code", icon: <CodeIcon color="#1F2328" /> },
  { label: "Issues", count: 3 },
  { label: "Pull requests", count: 1 },
  { label: "Actions" },
  { label: "Projects" },
  { label: "Security" },
  { label: "Insights" },
  { label: "Settings" },
];

const LANGUAGES = [
  { name: "YAML", percent: 69.1, color: "#CB171E" },
  { name: "SQL", percent: 24.6, color: "#E38C00" },
  { name: "Python", percent: 6.3, color: "#3572A5" },
];

const ABOUT_LINKS = ["Readme", "Activity", "2 stars", "4 watching", "0 forks"];

export function MockedGithubRepoPage() {
  return (
    <div className={S.page}>
      <header className={S.header}>
        <span className={S.menuButton}>
          <MenuIcon />
        </span>
        <span className={S.siteMark} />
        <nav className={S.breadcrumb}>
          <span>mazameli</span>
          <span className={S.muted}>/</span>
          <span className={S.semibold}>my-metabase-content</span>
        </nav>
        <span className={S.spacer} />
        <span className={S.searchInput}>
          <SearchIcon />
          <span className={S.muted}>Type / to search</span>
        </span>
        <span className={S.avatar} />
      </header>

      <nav className={S.repoTabs}>
        {REPO_TABS.map((tab, index) => (
          <span
            key={tab.label}
            className={index === 0 ? `${S.tab} ${S.tabSelected}` : S.tab}
          >
            {tab.icon}
            {tab.label}
            {tab.count != null && (
              <span className={S.counter}>{tab.count}</span>
            )}
          </span>
        ))}
      </nav>

      <main className={S.main}>
        <div className={S.titleRow}>
          <span className={S.orgAvatar} />
          <h1 className={S.repoName}>my-metabase-content</h1>
          <span className={S.visibility}>Private</span>
          <span className={S.spacer} />
          <CountButton label="Watch" count={4} />
          <CountButton label="Fork" count={0} />
          <CountButton label="Star" count={2} />
        </div>

        <div className={S.columns}>
          <div className={S.primary}>
            <div className={S.toolbar}>
              <span className={S.button}>
                <BranchIcon />
                main
                <CaretIcon />
              </span>
              <span className={S.stat}>
                <span className={S.semibold}>1</span>
                <span className={S.muted}>Branch</span>
              </span>
              <span className={S.stat}>
                <span className={S.semibold}>0</span>
                <span className={S.muted}>Tags</span>
              </span>
              <span className={S.spacer} />
              <span className={`${S.searchInput} ${S.goToFile}`}>
                <SearchIcon />
                <span className={S.muted}>Go to file</span>
              </span>
              <span className={S.button}>
                Add file
                <CaretIcon />
              </span>
              <span className={`${S.button} ${S.primaryButton}`}>
                <CodeIcon color="white" />
                Code
                <CaretIcon color="white" />
              </span>
            </div>

            <div className={S.box}>
              <div className={S.commitBar}>
                <span className={S.commitAvatar} />
                <span className={S.semibold}>maz</span>
                <span className={S.muted}>
                  Add Q4 pipeline review dashboard
                </span>
                <span className={S.spacer} />
                <span className={`${S.muted} ${S.small}`}>
                  a41c9e2 · 2 hours ago
                </span>
                <span className={`${S.semibold} ${S.small}`}>212 Commits</span>
              </div>
              {TREE.map((entry) => (
                <div key={entry.name} className={S.treeRow}>
                  {entry.type === "folder" ? <FolderIcon /> : <FileIcon />}
                  <span className={S.treeName}>{entry.name}</span>
                  <span className={S.treeMessage}>{entry.message}</span>
                  <span className={S.muted}>{entry.updated}</span>
                </div>
              ))}
            </div>

            <div className={S.box}>
              <div className={S.readmeHeader}>README</div>
              <div className={S.readmeBody}>
                <h2 className={S.readmeTitle}>Stats content</h2>
                <p className={S.readmeText}>
                  Dashboards, data apps, metrics, and published tables for the
                  Stats Metabase instance, along with the SQL snippets, Python
                  snippets, transforms, and glossary they depend on. Changes
                  merged to main are published to Metabase automatically.
                </p>
              </div>
            </div>
          </div>

          <aside className={S.sidebar}>
            <h3 className={S.sidebarHeading}>About</h3>
            <p className={S.about}>
              Content for the Stats Metabase instance, managed in git and
              published on merge.
            </p>
            {ABOUT_LINKS.map((link) => (
              <span key={link} className={S.muted}>
                {link}
              </span>
            ))}
            <hr className={S.divider} />
            <h3 className={S.sidebarHeading}>Languages</h3>
            <div className={S.languageBar}>
              {LANGUAGES.map((language) => (
                <span
                  key={language.name}
                  style={{
                    flexGrow: language.percent,
                    backgroundColor: language.color,
                  }}
                />
              ))}
            </div>
            <div className={S.languageLegend}>
              {LANGUAGES.map((language) => (
                <span key={language.name} className={S.languageItem}>
                  <span
                    className={S.languageDot}
                    style={{ backgroundColor: language.color }}
                  />
                  <span className={S.semibold}>{language.name}</span>
                  <span className={S.muted}>{language.percent}%</span>
                </span>
              ))}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function CountButton({ label, count }: { label: string; count: number }) {
  return (
    <span className={S.button}>
      {label}
      <span className={S.counter}>{count}</span>
      <CaretIcon />
    </span>
  );
}

// GitHub-style icons from the Figma design (Metabase's icon set doesn't match).
const MUTED = "#59636E";

function SvgIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={S.icon}
    >
      {children}
    </svg>
  );
}

function MenuIcon() {
  return (
    <SvgIcon>
      <path
        d="M2 4H14M2 8H14M2 12H14"
        stroke={MUTED}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </SvgIcon>
  );
}

function SearchIcon() {
  return (
    <SvgIcon>
      <path
        d="M11.25 7a4.25 4.25 0 1 1-8.5 0 4.25 4.25 0 0 1 8.5 0Z"
        stroke={MUTED}
        strokeWidth="1.3"
      />
      <path
        d="M10.25 10.25 13.5 13.5"
        stroke={MUTED}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </SvgIcon>
  );
}

function CodeIcon({ color }: { color: string }) {
  return (
    <SvgIcon>
      <path
        d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </SvgIcon>
  );
}

function CaretIcon({ color = MUTED }: { color?: string }) {
  return (
    <SvgIcon>
      <path
        d="M4.5 6.5 8 10l3.5-3.5"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </SvgIcon>
  );
}

function BranchIcon() {
  return (
    <SvgIcon>
      <circle cx="4" cy="3.5" r="1.75" stroke={MUTED} strokeWidth="1.2" />
      <circle cx="4" cy="12.5" r="1.75" stroke={MUTED} strokeWidth="1.2" />
      <circle cx="12" cy="5" r="1.75" stroke={MUTED} strokeWidth="1.2" />
      <path
        d="M4 5.25v5.5M4 10.25c5-.75 8-1 8-3.5"
        stroke={MUTED}
        strokeWidth="1.2"
      />
    </SvgIcon>
  );
}

function FolderIcon() {
  return (
    <SvgIcon>
      <path
        d="M1.5 3.5a1 1 0 0 1 1-1h3.2L7.2 4h6.3a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-9Z"
        fill="#54AEFF"
      />
    </SvgIcon>
  );
}

function FileIcon() {
  return (
    <SvgIcon>
      <path
        d="M12.5 4.5 9.5 1.5h-6a.5.5 0 0 0-.5.5v12a.5.5 0 0 0 .5.5H12a.5.5 0 0 0 .5-.5V4.5Zm-3-3v3h3"
        stroke={MUTED}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </SvgIcon>
  );
}
