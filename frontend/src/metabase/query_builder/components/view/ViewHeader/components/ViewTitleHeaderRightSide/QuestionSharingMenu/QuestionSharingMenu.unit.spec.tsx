import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor, within } from "__support__/ui";
import type { CreateUserRequest } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";

import { openMenu, setupQuestionSharingMenu } from "./tests/setup";

describe("QuestionSharingMenu", () => {
  beforeEach(() => {
    jest.mocked(navigator.clipboard.writeText).mockClear();
  });

  it("should not render anything if the question is a model", async () => {
    await setupQuestionSharingMenu({
      question: { type: "model" },
    });
    expect(screen.queryByTestId("sharing-menu-button")).not.toBeInTheDocument();
  });

  it("should have a 'share' tooltip by default", async () => {
    await setupQuestionSharingMenu({
      isAdmin: true,
    });
    expect(screen.getByTestId("sharing-menu-button")).toHaveAttribute(
      "aria-label",
      "Share",
    );
  });

  it("should not appear for archived questions", async () => {
    await setupQuestionSharingMenu({
      isAdmin: true,
      question: { archived: true },
    });

    expect(screen.queryByTestId("sharing-menu-button")).not.toBeInTheDocument();
  });

  it("should prompt you to save an unsaved question", async () => {
    await setupQuestionSharingMenu({
      isAdmin: true,
      question: { id: undefined },
    });

    expect(screen.getByTestId("sharing-menu-button")).toHaveAttribute(
      "aria-label",
      "You must save this question before sharing",
    );
  });

  describe("public links", () => {
    describe("admins", () => {
      it('should show a "Create Public link" menu item if public sharing is enabled', async () => {
        await setupQuestionSharingMenu({
          isAdmin: true,
          isPublicSharingEnabled: true,
        });
        await openMenu();
        expect(screen.getByText("Create a public link")).toBeInTheDocument();
      });

      it("clicking the sharing button should open the public link popover", async () => {
        await setupQuestionSharingMenu({
          isAdmin: true,
          isPublicSharingEnabled: true,
          hasPublicLink: true,
        });
        await openMenu();
        await userEvent.click(screen.getByText("Public link"));

        expect(
          await screen.findByTestId("public-link-popover-content"),
        ).toBeInTheDocument();

        // The PublicLinkPopover's useAsync hook flips its loading state after
        // the popover mounts; wait for the input to receive the public link url
        // so that state update stays wrapped in act.
        await waitFor(() => {
          expect(screen.getByTestId("public-link-input")).toHaveDisplayValue(
            "http://localhost:3000/public/question/1337bad801",
          );
        });
      });

      it('should show a "Public link" menu item if public sharing is enabled and a public link exists already', async () => {
        await setupQuestionSharingMenu({
          isAdmin: true,
          isPublicSharingEnabled: true,
          hasPublicLink: true,
        });
        await openMenu();
        expect(screen.getByText("Public link")).toBeInTheDocument();
        expect(
          screen.queryByText("Create a public link"),
        ).not.toBeInTheDocument();
      });

      // Creating a public link is a write; on a read-only remote-synced question
      // (can_write=false) the "Create" action is hidden (MB #72752)...
      it("should hide 'Create a public link' when the question is not writable", async () => {
        await setupQuestionSharingMenu({
          isAdmin: true,
          isPublicSharingEnabled: true,
          hasPublicLink: false,
          question: { can_write: false },
        });
        await openMenu();
        expect(
          screen.queryByText("Create a public link"),
        ).not.toBeInTheDocument();
        expect(screen.queryByText("Public link")).not.toBeInTheDocument();
      });

      // ...but an existing public link stays visible so it can still be
      // viewed/copied/revoked, which are reads.
      it("should keep an existing 'Public link' visible when the question is not writable", async () => {
        await setupQuestionSharingMenu({
          isAdmin: true,
          isPublicSharingEnabled: true,
          hasPublicLink: true,
          question: { can_write: false },
        });
        await openMenu();
        expect(screen.getByText("Public link")).toBeInTheDocument();
      });

      it("should hide the public link option if public sharing is disabled", async () => {
        await setupQuestionSharingMenu({
          isAdmin: true,
          isPublicSharingEnabled: false,
        });
        await openMenu();
        expect(screen.queryByText("Public link")).not.toBeInTheDocument();
        expect(screen.queryByText("Enable")).not.toBeInTheDocument();
        expect(
          screen.queryByText("Create a public link"),
        ).not.toBeInTheDocument();
        expect(screen.getByText("Embed")).toBeInTheDocument();
      });

      // note: if public sharing is disabled, the dashboard object provided by the backend should not have a UUID
    });

    describe("non-admins", () => {
      it("should show a sharing menu with both copy options when a public link exists", async () => {
        await setupQuestionSharingMenu({
          isAdmin: false,
          isPublicSharingEnabled: true,
          hasPublicLink: true,
        });
        expect(screen.getByTestId("sharing-menu-button")).toHaveAttribute(
          "aria-label",
          "Share",
        );
        await openMenu();
        expect(screen.getByText("Copy link")).toBeInTheDocument();
        expect(screen.getByText("Copy public link")).toBeInTheDocument();
        expect(screen.queryByText("Embed")).not.toBeInTheDocument();
      });

      it("should copy the app link from the menu", async () => {
        await setupQuestionSharingMenu({
          isAdmin: false,
          isPublicSharingEnabled: true,
          hasPublicLink: true,
        });
        await openMenu();
        await userEvent.click(screen.getByText("Copy link"));
        await waitFor(() =>
          expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            "http://localhost:3000/question/1-my-cool-question",
          ),
        );
        expect(await screen.findByText("Copied")).toBeInTheDocument();
        expect(screen.queryByText("Copy link")).not.toBeInTheDocument();
      });

      it("should copy the public link from the menu", async () => {
        await setupQuestionSharingMenu({
          isAdmin: false,
          isPublicSharingEnabled: true,
          hasPublicLink: true,
        });
        await openMenu();
        await userEvent.click(screen.getByText("Copy public link"));
        await waitFor(() =>
          expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            "http://localhost:3000/public/question/1337bad801",
          ),
        );
        expect(
          await screen.findByText("Public link copied to clipboard"),
        ).toBeInTheDocument();
      });

      it("should copy the app link directly when there is no public link", async () => {
        await setupQuestionSharingMenu({
          isAdmin: false,
          isPublicSharingEnabled: true,
          hasPublicLink: false,
        });
        const button = screen.getByTestId("sharing-menu-button");
        expect(button).toHaveAttribute("aria-label", "Copy link");

        await userEvent.click(button);
        await userEvent.hover(button);

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          "http://localhost:3000/question/1-my-cool-question",
        );
        expect(
          await screen.findByText("Link copied to clipboard"),
        ).toBeInTheDocument();
        expect(
          screen.queryByText("Ask your admin to create a public link"),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("embedding", () => {
    describe("non-admins", () => {
      it("should never expose the 'Embed' option if embedding is enabled", async () => {
        await setupQuestionSharingMenu({
          isAdmin: false,
          isEmbeddingEnabled: true,
          hasPublicLink: true,
          isPublicSharingEnabled: true,
        });
        expect(screen.queryByText("Embed")).not.toBeInTheDocument();
      });

      it("should never expose the 'Embed' option if embedding is disabled", async () => {
        await setupQuestionSharingMenu({
          isAdmin: false,
          isEmbeddingEnabled: false,
          hasPublicLink: true,
          isPublicSharingEnabled: true,
        });
        expect(screen.queryByText("Embed")).not.toBeInTheDocument();
      });
    });

    describe("admins", () => {
      it("should expose the 'Embed' option for a writable question", async () => {
        await setupQuestionSharingMenu({
          isAdmin: true,
          isEmbeddingEnabled: true,
          question: { can_write: true },
        });
        await openMenu();
        expect(screen.getByText("Embed")).toBeInTheDocument();
      });

      // The Embed option stays available even on a read-only remote-synced
      // question (can_write=false); the Publish button inside the modal is
      // disabled instead of hiding the entry point (MB #72752).
      it("should still show the 'Embed' option when the question is not writable", async () => {
        await setupQuestionSharingMenu({
          isAdmin: true,
          isEmbeddingEnabled: true,
          question: { can_write: false },
        });
        await openMenu();
        expect(screen.getByText("Embed")).toBeInTheDocument();
      });
    });
  });

  describe("invite to view", () => {
    it("shows the invite item for admins", async () => {
      await setupQuestionSharingMenu({ isAdmin: true });
      await openMenu();
      expect(
        screen.getByText("Invite someone to view this"),
      ).toBeInTheDocument();
    });

    it("does not show the invite item for non-admins", async () => {
      await setupQuestionSharingMenu({
        isAdmin: false,
        isPublicSharingEnabled: true,
        hasPublicLink: true,
      });
      await openMenu();
      expect(
        screen.queryByText("Invite someone to view this"),
      ).not.toBeInTheDocument();
    });

    it("opens the invite modal for the question", async () => {
      fetchMock.get("path:/api/permissions/group", []);
      fetchMock.get("path:/api/permissions/invite-group-ids", []);
      await setupQuestionSharingMenu({ isAdmin: true });
      await openMenu();
      await userEvent.click(screen.getByText("Invite someone to view this"));
      expect(
        await screen.findByText("Invite someone to view this question"),
      ).toBeInTheDocument();
    });

    it("invites with a temporary password and shares the question link when email is not set up", async () => {
      const QUESTION_ID = 42;
      const EMAIL = "newbie@metabase.com";
      // Differs from the typed email, so the success copy must use the response.
      const RETURNED_EMAIL = "returned@metabase.com";
      fetchMock.get("path:/api/permissions/group", []);
      fetchMock.get("path:/api/permissions/invite-group-ids", []);
      fetchMock.post("path:/api/user", async ({ options }) => {
        const body: CreateUserRequest = JSON.parse(
          // Unjustified type cast. FIXME
          await (options.body as unknown as Promise<string>),
        );
        return body.invite_target?.type === "question" &&
          body.invite_target.id === QUESTION_ID
          ? createMockUser({ id: 99, email: RETURNED_EMAIL })
          : { status: 400 };
      });
      await setupQuestionSharingMenu({
        isAdmin: true,
        isEmailSetup: false,
        question: { id: QUESTION_ID, name: "Orders by month" },
      });

      await openMenu();
      await userEvent.click(screen.getByText("Invite someone to view this"));
      await userEvent.type(await screen.findByLabelText(/Email/), EMAIL);
      await userEvent.click(
        screen.getByRole("button", { name: "Send invitation" }),
      );

      const modal = await screen.findByRole("dialog");
      expect(
        await within(modal).findByText(/We couldn't send an email invitation/),
      ).toBeVisible();
      expect(within(modal).getByText(RETURNED_EMAIL)).toBeVisible();

      const call = fetchMock.callHistory.lastCall("path:/api/user", {
        method: "POST",
      });
      const body: CreateUserRequest = JSON.parse(
        // Unjustified type cast. FIXME
        await (call?.options.body as unknown as Promise<string>),
      );
      expect(body.email).toBe(EMAIL);
      expect(body.invite_target).toEqual({
        type: "question",
        id: QUESTION_ID,
        name: "Orders by month",
      });
      expect(body.password).toEqual(expect.any(String));
      expect(body.password).not.toBe("");

      // The password shown is the one sent to the backend.
      expect(within(modal).getByLabelText("Temporary password")).toHaveValue(
        body.password,
      );
      expect(within(modal).getByLabelText("Link to share")).toHaveValue(
        `http://localhost:3000/question/${QUESTION_ID}-orders-by-month`,
      );
    });
  });
});
