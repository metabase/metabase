import userEvent from "@testing-library/user-event";
import type * as Ttag from "ttag";

import { setupUpdateCardEndpointWithError } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockCard } from "metabase-types/api/mocks";

import { MoveCardModal } from "./MoveCardModal";

jest.mock("ttag", () => {
  const actual = jest.requireActual<Ttag>("ttag");
  return {
    ...actual,
    c: () => ({
      jt: (strings: TemplateStringsArray) => strings[0],
    }),
  };
});

jest.mock("metabase/common/components/Pickers", () => ({
  MoveModal: ({
    onMove,
  }: {
    onMove: (destination: {
      id: number;
      model: "collection" | "dashboard";
    }) => void | Promise<void>;
  }) => (
    <>
      <button
        type="button"
        onClick={() => void onMove({ id: 2, model: "collection" })}
      >
        Choose collection
      </button>
      <button
        type="button"
        onClick={() => void onMove({ id: 3, model: "dashboard" })}
      >
        Choose dashboard
      </button>
    </>
  ),
}));

jest.mock("metabase/common/components/ConfirmModal", () => ({
  ConfirmModal: ({
    onConfirm,
    errorMessage,
    confirmButtonText,
  }: {
    onConfirm?: () => void | Promise<void>;
    errorMessage?: string;
    confirmButtonText?: string;
  }) => (
    <div>
      {errorMessage && <div role="alert">{errorMessage}</div>}
      <button type="button" onClick={() => void onConfirm?.()}>
        {confirmButtonText}
      </button>
    </div>
  ),
}));

type DestinationModel = "collection" | "dashboard";

interface SetupOpts {
  destinationModel: DestinationModel;
}

const setup = ({ destinationModel }: SetupOpts) => {
  const card = createMockCard({ dashboard_id: 1, dashboard_count: 1 });
  setupUpdateCardEndpointWithError(card.id);

  let onCloseCalled = false;
  renderWithProviders(
    <MoveCardModal
      card={card}
      onClose={() => {
        onCloseCalled = true;
      }}
    />,
  );

  return {
    chooseDestinationButtonName:
      destinationModel === "collection"
        ? "Choose collection"
        : "Choose dashboard",
    confirmButtonName: destinationModel === "collection" ? "Done" : "Okay",
    wasClosed: () => onCloseCalled,
  };
};

describe("MoveCardModal", () => {
  it("keeps the dashboard-to-collection confirmation open and shows a failed move", async () => {
    const { chooseDestinationButtonName, confirmButtonName, wasClosed } = setup(
      { destinationModel: "collection" },
    );

    await userEvent.click(
      screen.getByRole("button", { name: chooseDestinationButtonName }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: confirmButtonName }),
    );

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: confirmButtonName }),
    ).toBeInTheDocument();
    expect(wasClosed()).toBe(false);
  });

  it("shows a failed move in the dashboard-to-dashboard confirmation", async () => {
    const { chooseDestinationButtonName, confirmButtonName, wasClosed } = setup(
      { destinationModel: "dashboard" },
    );

    await userEvent.click(
      screen.getByRole("button", { name: chooseDestinationButtonName }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: confirmButtonName }),
    );

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: confirmButtonName }),
    ).toBeInTheDocument();
    expect(wasClosed()).toBe(false);
  });
});
