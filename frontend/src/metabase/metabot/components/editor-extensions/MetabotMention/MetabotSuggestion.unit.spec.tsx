import userEvent from "@testing-library/user-event";
import type { Editor } from "@tiptap/core";
import { createRef } from "react";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { act, renderWithProviders, screen, within } from "__support__/ui";
import type { BareSuggestionRendererRef } from "metabase/rich_text_editing/tiptap/extensions/suggestionRenderer";
import { createMockDatabase } from "metabase-types/api/mocks";

import { MetabotMentionSuggestion } from "./MetabotSuggestion";

const DATABASES = [
  createMockDatabase({ id: 1, name: "QA Postgres" }),
  createMockDatabase({ id: 2, name: "Sample Database" }),
];

const setup = () => {
  const command = jest.fn();
  const ref = createRef<BareSuggestionRendererRef>();
  setupDatabasesEndpoints(DATABASES);

  renderWithProviders(
    <MetabotMentionSuggestion
      ref={ref}
      items={[]}
      command={command}
      // The suggestion never reads the editor
      editor={{} as Editor}
      range={{ from: 0, to: 0 }}
      query=""
    />,
  );

  const pressKey = (key: string) =>
    act(() => {
      ref.current?.onKeyDown({ event: new KeyboardEvent("keydown", { key }) });
    });

  return { command, pressKey };
};

const getDialog = () => screen.getByRole("dialog", { name: "Metabot dialog" });

const expectOnlyOptionActive = (name: string | RegExp) => {
  expect(within(getDialog()).getByRole("option", { name })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(
    within(getDialog())
      .getAllByRole("option")
      .filter((option) => option.getAttribute("aria-selected") === "true"),
  ).toHaveLength(1);
};

describe("MetabotMentionSuggestion", () => {
  it("keeps exactly one database active while navigating with keyboard and mouse", async () => {
    const { pressKey } = setup();

    expect(
      await screen.findByRole("option", { name: /Sample Database/ }),
    ).toBeInTheDocument();
    expectOnlyOptionActive(/QA Postgres/);

    pressKey("ArrowDown");
    expectOnlyOptionActive(/Sample Database/);

    await userEvent.hover(screen.getByRole("option", { name: /QA Postgres/ }));
    expectOnlyOptionActive(/QA Postgres/);
  });
});
