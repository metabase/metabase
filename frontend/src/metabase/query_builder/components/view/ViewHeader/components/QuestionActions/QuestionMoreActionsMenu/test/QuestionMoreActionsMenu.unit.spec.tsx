import userEvent from "@testing-library/user-event";

import { getIcon, screen } from "__support__/ui";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { createMockCollection } from "metabase-types/api/mocks";

import { openMenu, setup } from "./setup";

describe("QuestionMoreActionsMenu", () => {
  it("should not render anything if the question is a model", async () => {
    setup({
      question: { type: "model" },
    });
    expect(
      screen.queryByTestId("notifications-menu-button"),
    ).not.toBeInTheDocument();
  });

  it("clicking the sharing button should open the public link popover", async () => {
    setup({
      isAdmin: false,
      isPublicSharingEnabled: true,
      hasPublicLink: true,
      isEnterprise: true,
    });

    await openMenu();

    await userEvent.click(screen.getByText("Public link"));

    expect(
      screen.getByTestId("public-link-popover-content"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("public-link-input")).toHaveDisplayValue(
      "http://localhost:3000/public/question/1337bad801",
    );
  });

  it("should show a 'ask your admin to create a public link' tooltip if public sharing is disabled", async () => {
    setup({
      isPublicSharingEnabled: false,
      hasPublicLink: true,
      isEnterprise: true,
    });

    await openMenu();

    // eslint-disable-next-line testing-library/no-node-access
    const sharingButton = getIcon("share").closest("button");

    expect(sharingButton).toBeDisabled();
    expect(sharingButton).toHaveTextContent(
      "Ask your admin to create a public link",
    );
  });

  it("should show a 'ask your admin to create a public link' menu item if public sharing is enabled, but there is no existing public link", async () => {
    setup({
      isAdmin: false,
      isPublicSharingEnabled: true,
      hasPublicLink: false,
    });

    await openMenu();

    // eslint-disable-next-line testing-library/no-node-access
    const sharingButton = getIcon("share").closest("button");

    expect(sharingButton).toBeDisabled();
    expect(sharingButton).toHaveTextContent(
      "Ask your admin to create a public link",
    );
  });

  it("should not allow sharing instance analytics question", async () => {
    setup({
      isAdmin: true,
      isPublicSharingEnabled: true,
      isEmbeddingEnabled: true,
      isEnterprise: true,
      question: {
        name: "analysis",
        collection: createMockCollection({
          id: 198,
          name: "Analytics",
          type: "instance-analytics",
        }),
      },
    });
    expect(
      screen.queryByTestId("notifications-menu-button"),
    ).not.toBeInTheDocument();
  });

  it("should not appear for archived questions", async () => {
    setup({
      isAdmin: true,
      question: { archived: true },
    });

    await openMenu();

    expect(
      screen.queryByTestId("embed-menu-public-link-item"),
    ).not.toBeInTheDocument();
  });

  it("should prompt you to save an unsaved question", async () => {
    setup({
      isAdmin: true,
      question: { id: undefined },
    });

    await openMenu();

    expect(
      screen.getByText("You must save this question before sharing"),
    ).toBeInTheDocument();
  });

  describe("public links", () => {
    describe("admins", () => {
      it('should show a "Create Public link" menu item if public sharing is enabled', async () => {
        setup({
          isAdmin: true,
          isPublicSharingEnabled: true,
        });

        await openMenu();

        expect(screen.getByText("Create a public link")).toBeInTheDocument();
      });

      it("clicking the sharing button should open the public link popover", async () => {
        setup({
          isAdmin: true,
          isPublicSharingEnabled: true,
          hasPublicLink: true,
        });
        await openMenu();
        await userEvent.click(screen.getByText("Public link"));

        expect(
          screen.getByTestId("public-link-popover-content"),
        ).toBeInTheDocument();
        expect(screen.getByTestId("public-link-input")).toHaveDisplayValue(
          "http://localhost:3000/public/question/1337bad801",
        );
      });

      it('should show a "Public link" menu item if public sharing is enabled and a public link exists already', async () => {
        setup({
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

      it("should show a 'public links are off' menu item if public sharing is disabled", async () => {
        setup({
          isAdmin: true,
          isPublicSharingEnabled: false,
        });
        await openMenu();
        expect(screen.getByText("Public links are off")).toBeInTheDocument();
        expect(
          screen.queryByText("Create a public link"),
        ).not.toBeInTheDocument();
      });

      // note: if public sharing is disabled, the dashboard object provided by the backend should not have a UUID
    });

    describe("non-admins", () => {
      it('should show a "Public link" menu item if there is a public link for the question', async () => {
        setup({
          isAdmin: false,
          isPublicSharingEnabled: true,
          hasPublicLink: true,
        });
        await openMenu();
        expect(screen.getByText("Public link")).toBeInTheDocument();
      });

      it('should show an "Ask your admin to create a public link" menu item if there is no public link for the question', async () => {
        setup({
          isAdmin: false,
          isPublicSharingEnabled: true,
          hasPublicLink: false,
        });
        await openMenu();
        expect(
          screen.getByText("Ask your admin to create a public link"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("embedding", () => {
    describe("admins", () => {
      describe("when embedding is disabled", () => {
        it("should open the embed modal when the 'Embed' menu item is clicked", async () => {
          const { onOpenModal } = setup({
            isAdmin: true,
            isEmbeddingEnabled: false,
          });
          await openMenu();
          await userEvent.click(screen.getByText("Embed"));

          expect(onOpenModal).toHaveBeenCalledTimes(1);
          expect(onOpenModal).toHaveBeenLastCalledWith(
            MODAL_TYPES.QUESTION_EMBED,
          );
        });
      });

      describe("when embedding is enabled", () => {
        it("should open the embed modal when the 'Embed' menu item is clicked", async () => {
          const { onOpenModal } = setup({
            isAdmin: true,
            isEmbeddingEnabled: true,
          });
          await openMenu();
          await userEvent.click(screen.getByText("Embed"));

          expect(onOpenModal).toHaveBeenCalledTimes(1);
          expect(onOpenModal).toHaveBeenLastCalledWith(
            MODAL_TYPES.QUESTION_EMBED,
          );
        });
      });
    });

    describe("non-admins", () => {
      it("should not show the 'Embed' menu item if embedding is enabled", async () => {
        setup({
          isAdmin: false,
          isEmbeddingEnabled: true,
        });
        await openMenu();
        expect(screen.queryByText("Embed")).not.toBeInTheDocument();
      });

      it("should not show the 'Embed' menu item if embedding is disabled", async () => {
        setup({
          isAdmin: false,
          isEmbeddingEnabled: false,
        });
        await openMenu();
        expect(screen.queryByText("Embed")).not.toBeInTheDocument();
      });
    });
  });
});
