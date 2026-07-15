import { fireEvent } from "@testing-library/react";

import {
  setupActionsEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { getNextId } from "__support__/utils";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import {
  createMockColumn,
  createMockDatabase,
  createMockField,
  createMockImplicitQueryAction,
  createMockTable,
} from "metabase-types/api/mocks";

import { DetailViewSidesheet } from "./DetailViewSidesheet";

const modelId = getNextId();
const database = createMockDatabase({
  id: getNextId(),
  settings: { "database-enable-actions": true },
});
const updateAction = createMockImplicitQueryAction({
  id: getNextId(),
  database_id: database.id,
  kind: "row/update",
  name: "Update",
});
const idFieldId = getNextId();
const idField = createMockField({
  id: idFieldId,
  name: "ID",
  display_name: "ID",
  semantic_type: "type/PK",
});
const idColumn = createMockColumn({
  id: idFieldId,
  name: "ID",
  display_name: "ID",
  semantic_type: "type/PK",
});
const table = createMockTable({
  id: getQuestionVirtualTableId(modelId),
  type: "model",
  fields: [idField],
});

function setup({
  showNav = true,
}: {
  showNav?: boolean;
} = {}) {
  const onNextClick = jest.fn();
  const onPreviousClick = jest.fn();

  setupDatabasesEndpoints([database]);
  setupActionsEndpoints([updateAction]);

  renderWithProviders(
    <DetailViewSidesheet
      columnSettings={undefined}
      columns={[idColumn]}
      columnsSettings={[undefined]}
      query={undefined}
      row={[1]}
      rowId={1}
      showImplicitActions
      showNav={showNav}
      table={table}
      tableForeignKeys={[]}
      url="/model/1-model/detail/1"
      onActionSuccess={jest.fn()}
      onClose={jest.fn()}
      onNextClick={onNextClick}
      onPreviousClick={onPreviousClick}
    />,
  );

  return { onNextClick, onPreviousClick };
}

describe("DetailViewSidesheet", () => {
  it("navigates rows with arrow keys when keyboard navigation is enabled", () => {
    const { onNextClick, onPreviousClick } = setup();

    fireEvent.keyDown(document.documentElement, { key: "ArrowUp" });
    expect(onPreviousClick).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document.documentElement, { key: "ArrowDown" });
    expect(onNextClick).toHaveBeenCalledTimes(1);
  });

  it("does not navigate rows with arrow keys when keyboard navigation is disabled", () => {
    const { onNextClick, onPreviousClick } = setup({ showNav: false });

    fireEvent.keyDown(document.documentElement, { key: "ArrowUp" });
    expect(onPreviousClick).not.toHaveBeenCalled();

    fireEvent.keyDown(document.documentElement, { key: "ArrowDown" });
    expect(onNextClick).not.toHaveBeenCalled();
  });

  it("does not navigate rows when using arrow keys immediately after opening the actions menu", async () => {
    const { onNextClick } = setup();

    fireEvent.keyDown(document.documentElement, { key: "ArrowDown" });
    expect(onNextClick).toHaveBeenCalledTimes(1);

    const actionsMenu = await screen.findByTestId("actions-menu");
    fireEvent.click(actionsMenu);
    const menu = await screen.findByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });

    expect(onNextClick).toHaveBeenCalledTimes(1);
  });
});
