import { getLinkedIssues, getPRsFromCommitMessage } from "./linked-issues";

const closingKeywords = [
  "Close",
  "Closes",
  "Closed",
  "Fix",
  "Fixes",
  "Fixed",
  "Resolve",
  "Resolves",
  "Resolved",
];

const issueUrl = (id: number | string) =>
  `https://github.com/metabase/metabase/issues/${id}`;

describe("getLinkedIssues", () => {
  describe("null", () => {
    it("should return `null` when body is empty", () => {
      expect(getLinkedIssues("")).toBeNull();
      expect(getLinkedIssues("   ")).toBeNull();
    });

    it("should return `null` when body doesn't contain the closing keyword", () => {
      expect(getLinkedIssues("#123")).toBeNull();
      expect(getLinkedIssues("Related to #123")).toBeNull();
      expect(getLinkedIssues(`Reproduces ${issueUrl(123)}`)).toBeNull();
      expect(getLinkedIssues(issueUrl(123))).toBeNull();
    });

    it("should return `null` when body doesn't contain the issue", () => {
      expect(getLinkedIssues("Lorem ipsum dolor sit amet.")).toBeNull();
      expect(getLinkedIssues("Fix 123.")).toBeNull();
      expect(getLinkedIssues("Fix#123.")).toBeNull();
      expect(getLinkedIssues("Fix # 123.")).toBeNull();
      expect(getLinkedIssues("123 456")).toBeNull();

      expect(
        getLinkedIssues("Close https://github.com/metabase/metabase/pull/123."),
      ).toBeNull();
    });

    it("should return `null` when the issue doesn't immediatelly follow the closing keyword", () => {
      // Two or more spaces
      expect(getLinkedIssues("Fix  #123")).toBeNull();
      // Newline
      expect(
        getLinkedIssues(`
        Fix
        #123
        `),
      ).toBeNull();
    });
  });

  describe.each(closingKeywords)("smoke tests", closingKeyword => {
    describe("shorthand syntax", () => {
      it(`should return the issue id for ${closingKeyword}`, () => {
        expect(getLinkedIssues(`${closingKeyword} #123`)).toEqual(["123"]);
      });

      it(`should return the issue id for ${closingKeyword.toUpperCase()}`, () => {
        expect(getLinkedIssues(`${closingKeyword.toUpperCase()} #123`)).toEqual(
          ["123"],
        );
      });

      it(`should return the issue id for ${closingKeyword.toLowerCase()}`, () => {
        expect(getLinkedIssues(`${closingKeyword.toLowerCase()} #123`)).toEqual(
          ["123"],
        );
      });
    });

    describe("https syntax", () => {
      const id = 123;
      const url = issueUrl(id);

      it(`should return the issue id for ${closingKeyword}`, () => {
        expect(getLinkedIssues(`${closingKeyword} ${url}`)).toEqual([`${id}`]);
      });

      it(`should return the issue id for ${closingKeyword.toUpperCase()}`, () => {
        expect(
          getLinkedIssues(`${closingKeyword.toUpperCase()} ${url}`),
        ).toEqual([`${id}`]);
      });

      it(`should return the issue id for ${closingKeyword.toLowerCase()}`, () => {
        expect(
          getLinkedIssues(`${closingKeyword.toLowerCase()} ${url}`),
        ).toEqual([`${id}`]);
      });
    });
  });

  describe("multiple issues", () => {
    const body = `
    Fix #123.
    Closes ${issueUrl(456)}, and resolves #789.
    On top of that, reproduces #888!
    `;

    it("should return the issue ids", () => {
      expect(getLinkedIssues(body)).toEqual(["123", "456", "789"]);
    });
  });
});

describe("getPRsFromCommitMessage", () => {
  it("should return `null` when no PR is found", () => {
    expect(getPRsFromCommitMessage("")).toBeNull();
    expect(getPRsFromCommitMessage("Lorem ipsum dolor sit amet.")).toBeNull();
    expect(getPRsFromCommitMessage("Fix #123.")).toBeNull();
    expect(getPRsFromCommitMessage("Fix#123.")).toBeNull();
    expect(getPRsFromCommitMessage("Fix # 123.")).toBeNull();
    expect(getPRsFromCommitMessage("123 456")).toBeNull();
    expect(getPRsFromCommitMessage("123 #456)")).toBeNull();
    expect(getPRsFromCommitMessage("123 (#456")).toBeNull();
    expect(getPRsFromCommitMessage("123 (#456.99)")).toBeNull();
  });

  it("should return the PR id for a single pr backport", () => {
    expect(getPRsFromCommitMessage("Backport (#123)")).toEqual([123]);
    expect(getPRsFromCommitMessage("Backport (#123456) !")).toEqual([123456]);
  });

  it("should return the PR id for a message with multiple backport PRs", () => {
    expect(getPRsFromCommitMessage("Backport (#123) (#456)")).toEqual([123, 456]);
    expect(getPRsFromCommitMessage("Backport (#1234) and (#4567)")).toEqual([1234, 4567]);
  });
});
