import { act } from "react-dom/test-utils";

import { renderWithProviders, screen, within } from "__support__/ui";
import { UndoListing } from "metabase/containers/UndoListing";
import * as Urls from "metabase/lib/urls";
import type { GetPublicCard } from "metabase-types/api";

import { PublicLinksListing } from "./PublicLinksListing";

const setup = async (props: { publicCardData?: GetPublicCard[] }) => {
  renderWithProviders(
    <div>
      <PublicLinksListing<GetPublicCard>
        data={props.publicCardData}
        noLinksMessage={`No questions have been publicly shared yet.`}
        getUrl={(question) => Urls.question(question)}
        getPublicUrl={({ name }) => {
          return `test-public-url-${name}`;
        }}
        revoke={() => Promise.resolve()}
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
});
