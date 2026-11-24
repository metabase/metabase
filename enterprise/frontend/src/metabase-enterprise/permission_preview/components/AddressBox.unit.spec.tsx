import userEvent from "@testing-library/user-event";

import { setupEntityIdEndpoint } from "__support__/server-mocks/entity-id";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockEntityId } from "metabase-types/api/mocks/entity-id";

import { AddressBox } from "./AddressBox";

const DASHBOARD_ENTITY_ID = createMockEntityId("abcdefghijklmnopqrstu");
const UNKNOWN_ENTITY_ID = createMockEntityId("zzzzzzzzzzzzzzzzzzzzz");

function setup(linkText = "/") {
  setupEntityIdEndpoint({ dashboard: { [DASHBOARD_ENTITY_ID]: 15 } });
  const onOpen = jest.fn();
  renderWithProviders(<AddressBox linkText={linkText} onOpen={onOpen} />);
  return { onOpen, box: screen.getByLabelText("Address") };
}

async function typeAndEnter(box: HTMLElement, text: string) {
  await userEvent.clear(box);
  await userEvent.type(box, `${text}{Enter}`);
}

describe("AddressBox", () => {
  it("shows the path of the frame and asks for a link, entity ID or ID", () => {
    const { box } = setup("/dashboard/15");

    expect(box).toHaveValue("/dashboard/15");
    expect(box).toHaveAttribute(
      "placeholder",
      "Paste a link, entity ID, or ID",
    );
  });

  it("opens a pasted Metabase link", async () => {
    const { box, onOpen } = setup();

    await typeAndEnter(box, "http://localhost:3000/question/7-orders");

    expect(onOpen).toHaveBeenCalledWith(
      "question/7",
      "http://localhost:3000/question/7-orders",
    );
  });

  it("opens an entity ID as the item that has it", async () => {
    const { box, onOpen } = setup();

    await typeAndEnter(box, DASHBOARD_ENTITY_ID);

    expect(onOpen).toHaveBeenCalledWith("dashboard/15", "/dashboard/15");
  });

  it("says no item has an entity ID nothing has, and keeps the text", async () => {
    const { box, onOpen } = setup();

    await typeAndEnter(box, UNKNOWN_ENTITY_ID);

    expect(
      await screen.findByText(
        "No question, dashboard, or collection has this entity ID.",
      ),
    ).toBeVisible();
    expect(box).toHaveValue(UNKNOWN_ENTITY_ID);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("says what to paste for text that is no link, and keeps the text", async () => {
    const { box, onOpen } = setup();

    await typeAndEnter(box, "hello");

    expect(
      await screen.findByText(
        "Paste a Metabase link, an entity ID, or a numeric ID.",
      ),
    ).toBeVisible();
    expect(box).toHaveValue("hello");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("asks which item has a numeric ID, then opens it", async () => {
    const { box, onOpen } = setup();

    await typeAndEnter(box, "42");
    expect(await screen.findByText("Which item has ID 42?")).toBeVisible();
    expect(onOpen).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("menuitem", { name: "Dashboard" }));

    expect(onOpen).toHaveBeenCalledWith("dashboard/42", "/dashboard/42");
  });

  it("clears the error once the text changes", async () => {
    const { box } = setup();
    await typeAndEnter(box, "hello");
    await screen.findByText(/Paste a Metabase link/);

    await userEvent.type(box, "x");

    expect(screen.queryByText(/Paste a Metabase link/)).not.toBeInTheDocument();
  });
});
