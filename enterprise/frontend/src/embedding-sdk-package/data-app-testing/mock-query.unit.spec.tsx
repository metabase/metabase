import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  aggregations,
  filter,
  useMetabaseQuery,
} from "embedding-sdk-package/hooks/public/use-metabase-query";
import { defineQuery } from "embedding-sdk-package/hooks/public/use-metabase-query/define-query";
import { MetabaseTestProvider } from "embedding-sdk-package/testing/components/MetabaseTestProvider";

import { mockQuery, mockQueryError } from "./mock-query";

const ORDERS_QUERY = defineQuery({
  source: {
    type: "card",
    entityId: "ordersQuestionEntity",
    name: "Orders list",
    columns: [
      { type: "column", name: "id", displayName: "ID", jsType: "number" },
      {
        type: "column",
        name: "status",
        displayName: "Status",
        jsType: "string",
      },
      { type: "column", name: "total", displayName: "Total", jsType: "number" },
    ],
  },
});

const REFUNDED_ORDERS = {
  filters: [filter({ type: "column", name: "status" }, "=", "refunded")],
} as const;

const ORDERS_BY_STATUS = {
  breakouts: [{ type: "column", name: "status" }],
  aggregations: [aggregations.count()],
} as const;

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  const isApiError =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "data" in error;

  return isApiError ? JSON.stringify(error) : "";
};

type OrdersListProps = {
  status?: string;
};

const OrdersList = ({ status }: OrdersListProps) => {
  const { data, error, refetch } = useMetabaseQuery(
    ORDERS_QUERY,
    status === undefined
      ? undefined
      : { filters: [filter({ type: "column", name: "status" }, "=", status)] },
  );

  return (
    <div>
      <ul>
        {data?.rows.map((row) => (
          <li key={String(row.id)}>
            {row.id} {row.status} {row.total}
          </li>
        ))}
      </ul>
      <p>{getErrorMessage(error)}</p>
      <button onClick={refetch}>Refetch</button>
    </div>
  );
};

const OrdersByStatus = () => {
  const { data } = useMetabaseQuery(ORDERS_QUERY, {
    breakouts: [{ type: "column", name: "status" }],
    aggregations: [aggregations.count()],
  });

  return (
    <div>
      <p>{data?.columns.map((column) => column.name).join(",")}</p>
      <ul>
        {data?.rows.map((row) => (
          <li key={String(row.status)}>
            {row.status}: {row.count}
          </li>
        ))}
      </ul>
    </div>
  );
};

type SetupOpts = {
  status?: string;
};

const setup = ({ status }: SetupOpts = {}) =>
  render(
    <MetabaseTestProvider>
      <OrdersList status={status} />
    </MetabaseTestProvider>,
  );

describe("mockQuery", () => {
  it("serves mocked rows and fills unset columns with defaults", async () => {
    mockQuery(ORDERS_QUERY, [{ id: 1, status: "paid", total: 42 }, { id: 2 }]);

    setup();

    expect(await screen.findByText("1 paid 42")).toBeInTheDocument();
    expect(screen.getByText("2 Status 1")).toBeInTheDocument();
  });

  it("answers only requests with mocked dynamic part", async () => {
    mockQuery(ORDERS_QUERY, [{ id: 1, status: "paid" }]);
    mockQuery(ORDERS_QUERY, REFUNDED_ORDERS, [{ id: 2, status: "refunded" }]);

    setup({ status: "refunded" });

    expect(await screen.findByText("2 refunded 1")).toBeInTheDocument();
    expect(screen.queryByText("1 paid 1")).not.toBeInTheDocument();
  });

  it("rejects query that has no mock", async () => {
    setup();

    expect(
      await screen.findByText(
        /No mock for query "Orders list"\. Call mockQuery/,
      ),
    ).toBeInTheDocument();
  });

  it("rejects requests with unmocked dynamic part", async () => {
    mockQuery(ORDERS_QUERY, [{ id: 1, status: "paid" }]);

    setup({ status: "pending" });

    expect(
      await screen.findByText(
        /No mock for query "Orders list" with dynamic part/,
      ),
    ).toBeInTheDocument();
  });

  it("builds grouped result columns from dynamic part", async () => {
    mockQuery(ORDERS_QUERY, ORDERS_BY_STATUS, [
      { status: "paid", count: 12 },
      { status: "refunded" },
    ]);

    render(
      <MetabaseTestProvider>
        <OrdersByStatus />
      </MetabaseTestProvider>,
    );

    expect(await screen.findByText("paid: 12")).toBeInTheDocument();
    expect(screen.getByText("refunded: 1")).toBeInTheDocument();
    expect(screen.getByText("status,count")).toBeInTheDocument();
  });

  it("records every request it answers", async () => {
    const orders = mockQuery(ORDERS_QUERY, REFUNDED_ORDERS, [{ id: 2 }]);

    setup({ status: "refunded" });
    await screen.findByText("2 Status 1");
    await userEvent.click(screen.getByRole("button", { name: "Refetch" }));

    await waitFor(() => expect(orders.calls()).toHaveLength(2));
    expect(orders.lastCall()).toEqual({ dynamicQuery: REFUNDED_ORDERS });
  });

  it("replaces earlier mock for same query and dynamic part", async () => {
    mockQuery(ORDERS_QUERY, [{ id: 1, status: "paid" }]);
    mockQuery(ORDERS_QUERY, [{ id: 3, status: "shipped" }]);

    setup();

    expect(await screen.findByText("3 shipped 1")).toBeInTheDocument();
    expect(screen.queryByText("1 paid 1")).not.toBeInTheDocument();
  });
});

describe("mockQueryError", () => {
  it("rejects query with mocked API error", async () => {
    mockQueryError(ORDERS_QUERY, { status: 403, message: "No access" });

    setup();

    expect(
      await screen.findByText(
        JSON.stringify({ status: 403, data: { message: "No access" } }),
      ),
    ).toBeInTheDocument();
  });

  it("rejects only requests with mocked dynamic part", async () => {
    mockQuery(ORDERS_QUERY, [{ id: 1, status: "paid" }]);
    mockQueryError(ORDERS_QUERY, REFUNDED_ORDERS, { status: 500 });

    setup({ status: "refunded" });

    expect(await screen.findByText(/"status":500/)).toBeInTheDocument();
  });
});
