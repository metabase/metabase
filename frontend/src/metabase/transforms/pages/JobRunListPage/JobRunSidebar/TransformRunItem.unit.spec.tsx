import {
  setupGetTransformEndpoint,
  setupListDatabaseSchemasEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { TransformRunForJobRun } from "metabase-types/api";
import {
  createMockTransform,
  createMockTransformRunForJobRun,
  createMockTransformTarget,
} from "metabase-types/api/mocks";

import { TransformRunItem } from "./TransformRunItem";

type SetupOpts = {
  transformRun?: TransformRunForJobRun;
};

const setup = async ({
  transformRun = createMockTransformRunForJobRun(),
}: SetupOpts = {}) => {
  const transform = createMockTransform({
    id: 5,
    target: createMockTransformTarget({
      database: 2,
      schema: "public",
      name: "orders",
    }),
  });
  setupGetTransformEndpoint(transform);
  setupListDatabaseSchemasEndpoint(transform.target.database, ["public"]);
  renderWithProviders(<TransformRunItem transformRun={transformRun} />);
  await waitForLoaderToBeRemoved();
};

describe("TransformRunItem", () => {
  it("should render the output table of the run", async () => {
    await setup({
      transformRun: createMockTransformRunForJobRun({ transform_id: 5 }),
    });

    expect(screen.getByText("Output:")).toBeInTheDocument();
    expect(screen.getByTestId("output-table-link")).toHaveTextContent("orders");
  });

  it("should not render an output table when the run has no transform", async () => {
    await setup({
      transformRun: createMockTransformRunForJobRun({ transform_id: null }),
    });

    expect(screen.queryByText("Output:")).not.toBeInTheDocument();
    expect(screen.queryByTestId("output-table-link")).not.toBeInTheDocument();
  });
});
