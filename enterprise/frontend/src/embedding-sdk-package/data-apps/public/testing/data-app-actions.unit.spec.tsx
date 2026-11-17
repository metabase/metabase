import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { useDataAppAction } from "embedding-sdk-package/hooks/public/use-action";
import { defineAction } from "embedding-sdk-package/hooks/public/use-action/define-action";
import {
  type MetabaseTestOptions,
  MetabaseTestProvider,
} from "embedding-sdk-package/testing/components/MetabaseTestProvider";

import { mockDataAppAction, mockDataAppActionError } from "./data-app-actions";

type RefundButtonProps = {
  parameters: { id: number; status?: string };
};

type SetupOpts = {
  parameters?: RefundButtonProps["parameters"];
  dataAppActions?: MetabaseTestOptions["dataAppActions"];
};

const ORDERS_TABLE = {
  type: "table",
  id: 1,
  fields: {
    id: {
      type: "column",
      fieldId: 100,
      tableId: 1,
      name: "ID",
      slug: "id",
      jsType: "number",
    },
    status: {
      type: "column",
      fieldId: 101,
      tableId: 1,
      name: "STATUS",
      slug: "status",
      jsType: "string",
    },
  },
} as const;

const REFUND_ORDER = defineAction({
  entityId: "refundOrderEntity",
  kind: "row/update",
  table: ORDERS_TABLE,
});

function RefundButton({ parameters }: RefundButtonProps) {
  const { execute, result, error } = useDataAppAction(REFUND_ORDER);
  const [thrownMessage, setThrownMessage] = useState("");

  function handleClick() {
    return execute(parameters).catch((thrown: unknown) =>
      setThrownMessage(thrown instanceof Error ? thrown.message : ""),
    );
  }

  return (
    <div>
      <button onClick={handleClick}>Refund</button>
      {result && <p>Refunded {result["rows-updated"]} order</p>}
      {error && <p>{error.data.message}</p>}
      {error?.data.errors?.status && <p>{error.data.errors.status}</p>}
      {thrownMessage && <p>{thrownMessage}</p>}
    </div>
  );
}

async function setup({
  parameters = { id: 1 },
  dataAppActions,
}: SetupOpts = {}) {
  render(
    <MetabaseTestProvider dataAppActions={dataAppActions}>
      <RefundButton parameters={parameters} />
    </MetabaseTestProvider>,
  );

  await userEvent.click(await screen.findByRole("button", { name: "Refund" }));
}

describe("mockDataAppAction", () => {
  it("resolves action with mocked result and records parameters", async () => {
    const refund = mockDataAppAction(REFUND_ORDER, { "rows-updated": 1 });

    await setup({
      parameters: { id: 7, status: "refunded" },
      dataAppActions: [refund],
    });

    expect(await screen.findByText("Refunded 1 order")).toBeInTheDocument();
    expect(refund.calls()).toEqual([
      { parameters: { id: 7, status: "refunded" } },
    ]);
    expect(refund.lastCall()).toEqual({
      parameters: { id: 7, status: "refunded" },
    });
  });

  it("rejects action that has no mock", async () => {
    await setup();

    expect(
      await screen.findByText(/No mock for action "refundOrderEntity"/),
    ).toBeInTheDocument();
  });

  it("rejects parameters that do not match action", async () => {
    const refund = mockDataAppAction(REFUND_ORDER, { "rows-updated": 1 });

    // @ts-expect-error `id` is a number; the mock checks it at runtime too
    await setup({ parameters: { id: "7" }, dataAppActions: [refund] });

    expect(
      await screen.findByText(/"id" must be a number value/),
    ).toBeInTheDocument();
    expect(refund.calls()).toHaveLength(0);
  });

  it("rejects parameters that are not columns of action table", async () => {
    const refund = mockDataAppAction(REFUND_ORDER, { "rows-updated": 1 });

    await setup({
      // @ts-expect-error `note` is not a column of the table
      parameters: { id: 7, note: "Damaged" },
      dataAppActions: [refund],
    });

    expect(
      await screen.findByText(/"note" is not a column of the action's table/),
    ).toBeInTheDocument();
    expect(refund.calls()).toHaveLength(0);
  });
});

describe("mockDataAppActionError", () => {
  it("rejects action with mocked error and field errors", async () => {
    const refund = mockDataAppActionError(REFUND_ORDER, {
      status: 400,
      message: "Refund failed",
      errors: { status: "Status is required" },
    });

    await setup({ dataAppActions: [refund] });

    expect(await screen.findByText("Refund failed")).toBeInTheDocument();
    expect(screen.getByText("Status is required")).toBeInTheDocument();
    expect(refund.lastCall()).toEqual({ parameters: { id: 1 } });
  });
});
