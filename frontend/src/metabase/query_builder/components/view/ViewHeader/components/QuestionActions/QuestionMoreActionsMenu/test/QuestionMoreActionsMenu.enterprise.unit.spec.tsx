import userEvent from "@testing-library/user-event";

import { getIcon, screen } from "__support__/ui";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { createMockCollection } from "metabase-types/api/mocks";

import { openMenu, setup } from "./setup";

describe("QuestionMoreActionsMenu", () => {
  it("clicking the sharing button should open the public link popover", async () => {
    const { onOpenModal } = setup({
      isAdmin: false,
      isPublicSharingEnabled: true,
      hasPublicLink: true,
      isEnterprise: true,
    });

    await openMenu();
    await userEvent.click(screen.getByText("Public link"));

    expect(onOpenModal).toHaveBeenCalledTimes(1);
    expect(onOpenModal).toHaveBeenLastCalledWith(
      MODAL_TYPES.QUESTION_PUBLIC_LINK,
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
});
