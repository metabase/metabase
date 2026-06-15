import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { TestRunInput, TestRunResponse } from "metabase-types/api";

import { TestRunSection } from "./TestRunSection";

const TRANSFORM_ID = 7;

const INPUTS: TestRunInput[] = [
  { table_id: 229, schema: "public", name: "orders", columns: ["id", "total"] },
  { table_id: 223, schema: "public", name: "people", columns: ["id", "state"] },
];

type SetupOpts = {
  inputs?: TestRunInput[] | { status: number; body: unknown };
  runResponse?: TestRunResponse | { status: number; body: unknown };
};

function setup({ inputs = INPUTS, runResponse }: SetupOpts = {}) {
  if (Array.isArray(inputs)) {
    fetchMock.get(
      `path:/api/transform/${TRANSFORM_ID}/test-run/inputs`,
      inputs,
    );
  } else {
    fetchMock.get(`path:/api/transform/${TRANSFORM_ID}/test-run/inputs`, {
      status: inputs.status,
      body: inputs.body,
    });
  }

  if (runResponse) {
    if ("status" in runResponse && "body" in runResponse) {
      fetchMock.post(`path:/api/transform/${TRANSFORM_ID}/test-run`, {
        status: runResponse.status,
        body: runResponse.body,
      });
    } else {
      fetchMock.post(
        `path:/api/transform/${TRANSFORM_ID}/test-run`,
        runResponse,
      );
    }
  }

  renderWithProviders(<TestRunSection transformId={TRANSFORM_ID} />);
}

async function uploadAllFiles() {
  const ordersInput = await screen.findByTestId("input-file-229");
  const peopleInput = screen.getByTestId("input-file-223");
  const expectedInput = screen.getByTestId("expected-file");

  await userEvent.upload(
    ordersInput,
    new File(["id,total\n1,5"], "orders.csv", { type: "text/csv" }),
  );
  await userEvent.upload(
    peopleInput,
    new File(["id,state\n1,CA"], "people.csv", { type: "text/csv" }),
  );
  await userEvent.upload(
    expectedInput,
    new File(["state\nCA"], "expected.csv", { type: "text/csv" }),
  );
}

describe("TestRunSection", () => {
  it("renders a dropzone per input table from the inputs response", async () => {
    setup();

    expect(await screen.findByText(/Input table: orders/)).toBeInTheDocument();
    expect(screen.getByText(/Input table: people/)).toBeInTheDocument();
    expect(screen.getByText(/Columns: id, total/)).toBeInTheDocument();
    expect(screen.getByText("Expected output")).toBeInTheDocument();
  });

  it("previews an uploaded CSV's parsed contents", async () => {
    setup();
    await uploadAllFiles();

    // orders.csv = "id,total\n1,5" → preview renders the header cell + the row value
    expect(await screen.findByText("total")).toBeInTheDocument();
    expect(await screen.findByText("5")).toBeInTheDocument();
  });

  it("renders the inputs-endpoint error instead of dropzones", async () => {
    setup({
      inputs: {
        status: 422,
        body: {
          status: "error",
          error: {
            type: "cannot-determine-inputs",
            message: "Cannot determine input tables for this transform",
          },
          test_run_id: null,
        },
      },
    });

    expect(
      await screen.findByText(
        "Cannot determine input tables for this transform",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Input table: orders/)).not.toBeInTheDocument();
  });

  it("disables the Run test button until every file is chosen", async () => {
    setup();

    const button = await screen.findByRole("button", { name: /Run test/ });
    expect(button).toBeDisabled();

    await uploadAllFiles();
    expect(button).toBeEnabled();
  });

  it("renders a success banner for a passed result", async () => {
    setup({
      runResponse: {
        status: "passed",
        diff: {
          status: "passed",
          "column-issues": [],
          "missing-rows": [],
          "extra-rows": [],
          "cell-mismatches": [],
          "row-counts": { actual: 3, expected: 3 },
          truncated: 0,
        },
        test_run_id: null,
      },
    });

    await uploadAllFiles();
    await userEvent.click(screen.getByRole("button", { name: /Run test/ }));

    expect(await screen.findByText("Test passed")).toBeInTheDocument();
  });

  it("renders the cell-mismatch table for a failed result", async () => {
    setup({
      runResponse: {
        status: "failed",
        diff: {
          status: "failed",
          "column-issues": [],
          "missing-rows": [["TX", "99", "277.95", "false"]],
          "extra-rows": [["TX", "2", "277.95", "false"]],
          "cell-mismatches": [
            {
              column: "order_count",
              "actual-canonical": "2",
              "expected-canonical": "99",
            },
          ],
          "row-counts": { actual: 3, expected: 3 },
          truncated: 0,
        },
        test_run_id: null,
      },
    });

    await uploadAllFiles();
    await userEvent.click(screen.getByRole("button", { name: /Run test/ }));

    expect(await screen.findByText("Test failed")).toBeInTheDocument();
    expect(screen.getByText("Cell mismatches")).toBeInTheDocument();
    expect(screen.getByText("order_count")).toBeInTheDocument();
    expect(
      screen.getByText(/Missing rows \(expected but not produced\)/),
    ).toBeInTheDocument();
  });

  it("renders column issues (objects, not strings) for a failed result", async () => {
    // column-issues entries are maps {type, column-name} from the backend, not
    // strings — rendering one as a bare React child would crash. Pin the shape.
    setup({
      runResponse: {
        status: "failed",
        diff: {
          status: "failed",
          "column-issues": [
            { type: "missing", "column-name": "revenue" },
            { type: "extra", "column-name": "gross" },
          ],
          "missing-rows": [],
          "extra-rows": [],
          "cell-mismatches": [],
          "row-counts": { actual: 3, expected: 3 },
          truncated: 0,
        },
        test_run_id: null,
      },
    });

    await uploadAllFiles();
    await userEvent.click(screen.getByRole("button", { name: /Run test/ }));

    expect(await screen.findByText("Test failed")).toBeInTheDocument();
    expect(screen.getByText("Missing column: revenue")).toBeInTheDocument();
    expect(screen.getByText("Unexpected column: gross")).toBeInTheDocument();
  });

  it("renders the error message for an error response", async () => {
    const message =
      'This transform can\'t be test-run: the original table "orders" still appears as a dangling column qualifier.';
    setup({
      runResponse: {
        status: 422,
        body: {
          status: "error",
          error: {
            type: ":metabase.transforms.test-run.resolve/cannot-test-run",
            message,
          },
          test_run_id: null,
        },
      },
    });

    await uploadAllFiles();
    await userEvent.click(screen.getByRole("button", { name: /Run test/ }));

    await waitFor(() => {
      expect(screen.getByText(message)).toBeInTheDocument();
    });
  });
});
