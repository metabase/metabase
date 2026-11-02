import {
  getDataAppSourceLocation,
  getDataAppStatusLabel,
  isDataAppOpenable,
} from "./utils";

describe("getDataAppStatusLabel", () => {
  it.each([
    { enabled: true, outdated: false, label: "Live" },
    { enabled: false, outdated: false, label: "Draft" },
    { enabled: true, outdated: true, label: "Live, outdated" },
    { enabled: false, outdated: true, label: "Draft, outdated" },
  ])(
    "returns $label when enabled is $enabled and outdated is $outdated",
    ({ enabled, outdated, label }) => {
      expect(getDataAppStatusLabel({ enabled, outdated })).toBe(label);
    },
  );
});

describe("isDataAppOpenable", () => {
  it.each([
    { enabled: true, outdated: false, isOpenable: true },
    { enabled: false, outdated: false, isOpenable: false },
    { enabled: true, outdated: true, isOpenable: false },
  ])(
    "returns $isOpenable when enabled is $enabled and outdated is $outdated",
    ({ enabled, outdated, isOpenable }) => {
      expect(isDataAppOpenable({ enabled, outdated })).toBe(isOpenable);
    },
  );
});

describe("getDataAppSourceLocation", () => {
  it.each([
    {
      host: "GitHub",
      repoUrl: "https://github.com/acme-inco/metabase.git",
      url: "https://github.com/acme-inco/metabase/tree/main/data_apps/sales",
    },
    {
      host: "a self-hosted GitLab",
      repoUrl: "https://gitlab.acme.com/data/metabase.git",
      url: "https://gitlab.acme.com/data/metabase/-/tree/main/data_apps/sales",
    },
    {
      host: "a GitLab served over plain HTTP",
      repoUrl: "http://gitlab.internal/data/metabase.git",
      url: "http://gitlab.internal/data/metabase/-/tree/main/data_apps/sales",
    },
  ])("links to the app's folder on $host", ({ repoUrl, url }) => {
    expect(
      getDataAppSourceLocation({ repoUrl, branch: "main", slug: "sales" }),
    ).toEqual({ type: "link", url });
  });

  it("keeps the slashes of a branch name", () => {
    expect(
      getDataAppSourceLocation({
        repoUrl: "https://github.com/acme-inco/metabase",
        branch: "feature/sales-app",
        slug: "sales",
      }),
    ).toEqual({
      type: "link",
      url: "https://github.com/acme-inco/metabase/tree/feature/sales-app/data_apps/sales",
    });
  });

  it.each([
    { branch: "fix#123", branchPath: "fix%23123" },
    { branch: "release/100%-done", branchPath: "release/100%25-done" },
  ])(
    "escapes the characters of $branch that mean something in a URL",
    ({ branch, branchPath }) => {
      expect(
        getDataAppSourceLocation({
          repoUrl: "https://github.com/acme-inco/metabase.git",
          branch,
          slug: "sales",
        }),
      ).toEqual({
        type: "link",
        url: `https://github.com/acme-inco/metabase/tree/${branchPath}/data_apps/sales`,
      });
    },
  );

  it.each([
    {
      repoUrl: "https://bot:secret-token@github.com/acme-inco/metabase.git",
      location: {
        type: "link",
        url: "https://github.com/acme-inco/metabase/tree/main/data_apps/sales",
      },
    },
    {
      repoUrl: "https://secret-token@github.com/acme-inco/metabase.git",
      location: {
        type: "link",
        url: "https://github.com/acme-inco/metabase/tree/main/data_apps/sales",
      },
    },
    {
      repoUrl: "https://bot:secret-token@bitbucket.org/acme-inco/metabase.git",
      location: {
        type: "text",
        text: "https://bitbucket.org/acme-inco/metabase.git",
      },
    },
  ])("leaves the credentials in $repoUrl out", ({ repoUrl, location }) => {
    expect(
      getDataAppSourceLocation({ repoUrl, branch: "main", slug: "sales" }),
    ).toEqual(location);
  });

  it.each([
    {
      reason: "isn't on GitHub or GitLab",
      repoUrl: "https://bitbucket.org/acme-inco/metabase.git",
      branch: "main",
    },
    {
      reason: "has no branch",
      repoUrl: "https://github.com/acme-inco/metabase.git",
      branch: null,
    },
  ])(
    "shows the repository URL as it is when it $reason",
    ({ repoUrl, branch }) => {
      expect(
        getDataAppSourceLocation({ repoUrl, branch, slug: "sales" }),
      ).toEqual({ type: "text", text: repoUrl });
    },
  );

  it.each([
    { repoUrl: "file:///srv/git/metabase" },
    { repoUrl: "/srv/git/metabase/" },
  ])(
    "gives the folder's path in the local repository $repoUrl",
    ({ repoUrl }) => {
      expect(
        getDataAppSourceLocation({ repoUrl, branch: "main", slug: "sales" }),
      ).toEqual({ type: "text", text: "/srv/git/metabase/data_apps/sales" });
    },
  );

  it("shows a repository URL that can't be parsed as is", () => {
    const repoUrl = "https://git acme com/metabase.git";
    expect(
      getDataAppSourceLocation({ repoUrl, branch: "main", slug: "sales" }),
    ).toEqual({ type: "text", text: repoUrl });
  });
});
