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
  onNextClick = jest.fn(),
  onPreviousClick = jest.fn(),
}: {
  onNextClick?: jest.Mock;
  onPreviousClick?: jest.Mock;
} = {}) {
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
      showNav
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
  it("does not navigate rows when using arrow keys immediately after opening the actions menu", async () => {
    const { onNextClick } = setup();

    const actionsMenu = await screen.findByTestId("actions-menu");
    fireEvent.click(actionsMenu);
    fireEvent.keyDown(window, { key: "ArrowDown" });

    expect(onNextClick).not.toHaveBeenCalled();
  });
});
