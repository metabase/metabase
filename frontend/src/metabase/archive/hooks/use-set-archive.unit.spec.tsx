import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { type ArchivableItem, useSetArchive } from "./use-set-archive";

function TestComponent({
  item,
  onError,
}: {
  item: ArchivableItem;
  onError: (error: unknown) => void;
}) {
  const setArchive = useSetArchive();

  return (
    <button
      onClick={async () => {
        try {
          await setArchive(item);
        } catch (error) {
          onError(error);
        }
      }}
    >
      Archive
    </button>
  );
}

const setup = () => {
  const errors: unknown[] = [];

  renderWithProviders(
    <TestComponent
      item={{ model: "collection", id: 7, can_write: true }}
      onError={(error) => errors.push(error)}
    />,
    { withUndos: true },
  );

  return { errors };
};

const clickArchive = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Archive" }));
};

describe("useSetArchive", () => {
  it("does not show a success toast when archiving fails (#75180)", async () => {
    fetchMock.put("path:/api/collection/7", 503);

    const { errors } = setup();
    await clickArchive();

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/collection/7", {
          method: "PUT",
        }),
      ).toHaveLength(1);
    });
    await waitFor(() => {
      expect(errors).toHaveLength(1);
    });

    expect(screen.queryByText("Trashed collection")).not.toBeInTheDocument();
  });
});
