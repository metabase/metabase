import userEvent from "@testing-library/user-event";
import { act } from "react-dom/test-utils";

import { renderWithProviders, screen, within } from "__support__/ui";
import { UndoListing } from "metabase/containers/UndoListing";
import * as Urls from "metabase/lib/urls";
import type { GetPublicCard } from "metabase-types/api";

import { PublicLinksListing } from "./PublicLinksListing";

const setup = async (props: {
  publicCardData?: GetPublicCard[];
  revoke?: () => Promise<unknown>;
}) => {
  renderWithProviders(
    <div>
      <PublicLinksListing<GetPublicCard>
        data={props.publicCardData}
        noLinksMessage={`No questions have been publicly shared yet.`}
        getUrl={(question) => Urls.question(question)}
        getPublicUrl={({ name }) => {
          return `test-public-url-${name}`;
        }}
        revoke={props.revoke || Promise.resolve}
      />
      <UndoListing />
    </div>,
  );
};

describe("PublicSharingSettingsPage", () => {
  it("should render an empty table when no data present", async () => {
    await act(() => setup({}));
    expect(
      screen.getByText("No questions have been publicly shared yet."),
    ).toBeInTheDocument();
  });

  it("should render table data", async () => {
    const publicCardData: GetPublicCard[] = [
      {
        public_uuid: "5eb3c485-f7d4-40d7-b625-6cc338cf9f4c",
        name: "Test Question 1",
        id: 1,
      },
      {
        public_uuid: "316ff9b2-d86e-483f-9156-c766081a1c05",
        name: "Test Question 2",
        id: 2,
      },
      {
        public_uuid: "c5c992f9-e761-4a26-a836-de5ce89d1fe5",
        name: "Test Question 3",
        id: 3,
      },
    ];
    await act(() =>
      setup({
        publicCardData,
      }),
    );

    const tableRows = screen.getAllByRole("row");

    // first row contains the table headers
    tableRows.slice(1).forEach((row, index) => {
      const cells = within(row).getAllByRole("cell");
      const cardName = publicCardData[index].name;
      expect(cells[0]).toHaveTextContent(cardName);
      expect(cells[1]).toHaveTextContent(`test-public-url-${cardName}`);
      const anchor = within(cells[1]).getByRole("link");
      expect(anchor).toBeInTheDocument();
      expect(anchor).toHaveAttribute(
        "href",
        expect.stringContaining(`test-public-url-${cardName}`),
      );
      const button = within(cells[2]).getByRole("button");
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute("aria-label", "Revoke link");
    });
  });

  it("should only call revoke function when user confirms in modal", async () => {
    const mockRevoke = jest.fn().mockResolvedValue(undefined);
    const publicCardData: GetPublicCard[] = [
      {
        public_uuid: "5eb3c485-f7d4-40d7-b625-6cc338cf9f4c",
        name: "Test Question 1",
        id: 1,
      },
    ];

    await act(() =>
      setup({
        publicCardData,
        revoke: mockRevoke,
      }),
    );

    const revokeButton = screen.getByRole("button", { name: /revoke link/i });
    await userEvent.click(revokeButton);

    expect(screen.getByText("Disable this link?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "They won't work anymore, and can't be restored, but you can create new links.",
      ),
    ).toBeInTheDocument();

    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    await userEvent.click(cancelButton);
    expect(screen.queryByText("Disable this link?")).not.toBeInTheDocument();
    expect(mockRevoke).not.toHaveBeenCalled();

    await userEvent.click(revokeButton);
    const confirmButton = screen.getByRole("button", { name: /yes/i });
    await userEvent.click(confirmButton);
    expect(mockRevoke).toHaveBeenCalledTimes(1);
    expect(mockRevoke).toHaveBeenCalledWith(publicCardData[0]);
    expect(screen.queryByText("Disable this link?")).not.toBeInTheDocument();
  });
});
