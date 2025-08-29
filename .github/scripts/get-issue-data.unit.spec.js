const { getIssueData, clearMembershipCache } = require("./get-issue-data.js");

jest.mock("../../release/src/linked-issues.ts", () => ({
  getLinkedIssues: jest.fn(),
}));

const { getLinkedIssues } = require("../../release/src/linked-issues.ts");

describe("getIssueData", () => {
  let mockContext, mockGitHub;

  beforeEach(() => {
    jest.clearAllMocks();
    clearMembershipCache();

    mockGitHub = {
      rest: {
        issues: {
          get: jest.fn(),
          listComments: jest.fn(),
        },
        pulls: {
          get: jest.fn(),
          listReviews: jest.fn(),
        },
        orgs: {
          getMembershipForUser: jest.fn(),
        },
      },
    };

    mockContext = {
      eventName: "issues",
      repo: { owner: "metabase", repo: "metabase" },
      payload: {
        issue: {
          number: 123,
          title: "Test Issue",
          user: { login: "testuser" },
        },
      },
    };
  });

  describe("issues trigger", () => {
    it("should handle issue label trigger correctly", async () => {
      mockGitHub.rest.issues.listComments.mockResolvedValue({
        data: [
          { user: { login: "employee1" }, body: "Test comment" },
          { user: { login: "external1" }, body: "External comment" },
        ],
      });

      mockGitHub.rest.orgs.getMembershipForUser
        .mockResolvedValueOnce({ data: { state: "active" } }) // employee1 is active
        .mockRejectedValueOnce({ status: 404 }); // external1 not found

      const result = await getIssueData({
        context: mockContext,
        github: mockGitHub,
        manualIssueNumber: null,
      });

      expect(result.issueNumber).toBe(123);
      expect(result.issueData.title).toBe("Test Issue");
      expect(result.employeeComments).toHaveLength(1);
      expect(result.employeeComments[0].user.login).toBe("employee1");
      expect(result.triggerType).toBe("issues");
      expect(result.prReviews).toHaveLength(0);
    });
  });

  describe("workflow_dispatch trigger", () => {
    it("should fetch issue data when manually triggered", async () => {
      const manualContext = {
        ...mockContext,
        eventName: "workflow_dispatch",
      };

      mockGitHub.rest.issues.get.mockResolvedValue({
        data: {
          number: 456,
          title: "Manual Issue",
          user: { login: "manual_user" },
        },
      });

      mockGitHub.rest.issues.listComments.mockResolvedValue({ data: [] });

      const result = await getIssueData({
        context: manualContext,
        github: mockGitHub,
        manualIssueNumber: "456",
      });

      expect(mockGitHub.rest.issues.get).toHaveBeenCalledWith({
        owner: "metabase",
        repo: "metabase",
        issue_number: 456,
      });
      expect(result.issueNumber).toBe(456);
      expect(result.triggerType).toBe("workflow_dispatch");
    });
  });

  describe("pull_request_review trigger", () => {
    it("should extract issue number from branch name", async () => {
      const prContext = {
        ...mockContext,
        eventName: "pull_request_review",
        payload: {
          pull_request: {
            number: 789,
            head: { ref: "claude-fix/issue-123-test-bug-fix" },
          },
        },
      };

      mockGitHub.rest.issues.get.mockResolvedValue({
        data: {
          number: 123,
          title: "Original Issue",
          user: { login: "issue_creator" },
        },
      });

      mockGitHub.rest.issues.listComments.mockResolvedValue({ data: [] });

      mockGitHub.rest.pulls.listReviews.mockResolvedValue({
        data: [
          {
            state: "CHANGES_REQUESTED",
            user: { login: "reviewer1" },
            body: "Please fix this",
          },
        ],
      });

      mockGitHub.rest.orgs.getMembershipForUser.mockResolvedValue({
        data: { state: "active" },
      });

      const result = await getIssueData({
        context: prContext,
        github: mockGitHub,
        manualIssueNumber: null,
      });

      expect(result.issueNumber).toBe(123);
      expect(result.prReviews).toHaveLength(1);
      expect(result.prReviews[0].user.login).toBe("reviewer1");
    });

    it("should fallback to PR body for issue number using getLinkedIssues", async () => {
      const prContext = {
        ...mockContext,
        eventName: "pull_request_review",
        payload: {
          pull_request: {
            number: 789,
            head: { ref: "some-other-branch-name" },
          },
        },
      };

      mockGitHub.rest.pulls.get.mockResolvedValue({
        data: { body: "This PR fixes #456" },
      });

      getLinkedIssues.mockReturnValue(["456"]);

      mockGitHub.rest.issues.get.mockResolvedValue({
        data: {
          number: 456,
          title: "Fixed Issue",
          user: { login: "issue_creator" },
        },
      });

      mockGitHub.rest.issues.listComments.mockResolvedValue({ data: [] });
      mockGitHub.rest.pulls.listReviews.mockResolvedValue({ data: [] });

      const result = await getIssueData({
        context: prContext,
        github: mockGitHub,
        manualIssueNumber: null,
      });

      expect(getLinkedIssues).toHaveBeenCalledWith("This PR fixes #456");
      expect(result.issueNumber).toBe(456);
    });

    it("should throw error when no issue number found", async () => {
      const prContext = {
        ...mockContext,
        eventName: "pull_request_review",
        payload: {
          pull_request: {
            number: 789,
            head: { ref: "some-other-branch-name" },
          },
        },
      };

      mockGitHub.rest.pulls.get.mockResolvedValue({
        data: { body: "No issue referenced" },
      });

      getLinkedIssues.mockReturnValue(null);

      await expect(
        getIssueData({
          context: prContext,
          github: mockGitHub,
          manualIssueNumber: null,
        }),
      ).rejects.toThrow(
        "Could not extract issue number from branch name or PR body",
      );
    });
  });

  describe("employee filtering", () => {
    it("should cache membership lookups across comments and reviews", async () => {
      // Setup PR context with reviews
      const prContext = {
        ...mockContext,
        eventName: "pull_request_review",
        payload: {
          pull_request: {
            number: 789,
            head: { ref: "claude-fix/issue-123-test-bug-fix" },
          },
        },
      };

      mockGitHub.rest.issues.get.mockResolvedValue({
        data: {
          number: 123,
          title: "Test Issue",
          user: { login: "issue_creator" },
        },
      });

      // Same user appears in both comments and reviews
      mockGitHub.rest.issues.listComments.mockResolvedValue({
        data: [
          { user: { login: "employee1" }, body: "First comment" },
          { user: { login: "employee1" }, body: "Second comment" },
        ],
      });

      mockGitHub.rest.pulls.listReviews.mockResolvedValue({
        data: [
          {
            state: "CHANGES_REQUESTED",
            user: { login: "employee1" },
            body: "Review comment",
          },
        ],
      });

      mockGitHub.rest.orgs.getMembershipForUser.mockResolvedValue({
        data: { state: "active" },
      });

      const result = await getIssueData({
        context: prContext,
        github: mockGitHub,
        manualIssueNumber: null,
      });

      expect(result.employeeComments).toHaveLength(2);
      expect(result.prReviews).toHaveLength(1);
      // Should only call the API once due to global caching across both comments and reviews
      expect(mockGitHub.rest.orgs.getMembershipForUser).toHaveBeenCalledTimes(
        1,
      );
    });

    it("should handle permission errors gracefully", async () => {
      mockGitHub.rest.issues.listComments.mockResolvedValue({
        data: [{ user: { login: "testuser" }, body: "Test" }],
      });

      mockGitHub.rest.orgs.getMembershipForUser.mockRejectedValue({
        status: 403,
        message: "Forbidden",
      });

      await expect(
        getIssueData({
          context: mockContext,
          github: mockGitHub,
          manualIssueNumber: null,
        }),
      ).rejects.toThrow("Unable to check organization membership: Forbidden");
    });
  });
});
