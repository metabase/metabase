import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  aggregations,
  filter,
  useMetabaseQuery,
} from "embedding-sdk-package/hooks/public/use-metabase-query";
import { defineQuery } from "embedding-sdk-package/hooks/public/use-metabase-query/define-query";
import {
  type MetabaseTestOptions,
  MetabaseTestProvider,
} from "embedding-sdk-package/testing/components/MetabaseTestProvider";

import { mockDataAppQuery, mockDataAppQueryError } from "./data-app-queries";

type OrdersListProps = {
  status?: string;
};

type SetupOpts = {
  status?: string;
  dataAppQueries?: MetabaseTestOptions["dataAppQueries"];
};

const ORDERS_TABLE = {
  type: "table",
  id: 1,
  fields: {
    id: {
      type: "column",
      fieldId: 100,
      tableId: 1,
      name: "id",
      slug: "id",
      displayName: "ID",
      jsType: "number",
    },
    status: {
      type: "column",
      fieldId: 101,
      tableId: 1,
      name: "status",
      slug: "status",
      displayName: "Status",
      jsType: "string",
    },
    total: {
      type: "column",
      fieldId: 102,
      tableId: 1,
      name: "total",
      slug: "total",
      displayName: "Total",
      jsType: "number",
    },
  },
} as const;

const ORDERS_QUERY = defineQuery({
  entityId: "ordersListEntity",
  source: ORDERS_TABLE,
});

const REFUNDED_ORDERS = {
  filters: [filter({ type: "column", name: "status" }, "=", "refunded")],
} as const;

const ORDERS_BY_STATUS = {
  breakouts: [{ type: "column", name: "status" }],
  aggregations: [aggregations.count()],
} as const;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  const isApiError =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "data" in error;

  return isApiError ? JSON.stringify(error) : "";
}

function OrdersList({ status }: OrdersListProps) {
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
}

function OrdersByStatus() {
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
}

function setup({ status, dataAppQueries }: SetupOpts = {}) {
  return render(
    <MetabaseTestProvider dataAppQueries={dataAppQueries}>
      <OrdersList status={status} />
    </MetabaseTestProvider>,
  );
}

describe("mockDataAppQuery", () => {
  it("serves mocked rows and leaves unset columns null", async () => {
    setup({
      dataAppQueries: [
        mockDataAppQuery(ORDERS_QUERY, [
          { id: 1, status: "paid", total: 42 },
          { id: 2 },
        ]),
      ],
    });

    expect(await screen.findByText("1 paid 42")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("answers only requests with mocked dynamic part", async () => {
    setup({
      status: "refunded",
      dataAppQueries: [
        mockDataAppQuery(ORDERS_QUERY, [{ id: 1, status: "paid" }]),
        mockDataAppQuery(ORDERS_QUERY, REFUNDED_ORDERS, [
          { id: 2, status: "refunded" },
        ]),
      ],
    });

    expect(await screen.findByText("2 refunded")).toBeInTheDocument();
    expect(screen.queryByText("1 paid")).not.toBeInTheDocument();
  });

  it("rejects query that has no mock", async () => {
    setup();

    expect(
      await screen.findByText(
        /No mock for query "ordersListEntity"\. Pass mockDataAppQuery/,
      ),
    ).toBeInTheDocument();
  });

  it("rejects requests with unmocked dynamic part", async () => {
    setup({
      status: "pending",
      dataAppQueries: [
        mockDataAppQuery(ORDERS_QUERY, [{ id: 1, status: "paid" }]),
      ],
    });

    expect(
      await screen.findByText(
        /No mock for query "ordersListEntity" with dynamic part/,
      ),
    ).toBeInTheDocument();
  });

  it("builds result columns from query", async () => {
    render(
      <MetabaseTestProvider
        dataAppQueries={[
          mockDataAppQuery(ORDERS_QUERY, ORDERS_BY_STATUS, [
            { status: "paid", count: 12 },
            { status: "refunded" },
          ]),
        ]}
      >
        <OrdersByStatus />
      </MetabaseTestProvider>,
    );

    expect(await screen.findByText("paid: 12")).toBeInTheDocument();
    expect(screen.getByText("refunded:")).toBeInTheDocument();
    expect(screen.getByText("status,count")).toBeInTheDocument();
  });

  it("records every request it answers", async () => {
    const orders = mockDataAppQuery(ORDERS_QUERY, REFUNDED_ORDERS, [{ id: 2 }]);

    setup({ status: "refunded", dataAppQueries: [orders] });
    await screen.findByText("2");
    await userEvent.click(screen.getByRole("button", { name: "Refetch" }));

    await waitFor(() => expect(orders.calls()).toHaveLength(2));
    expect(orders.lastCall()).toEqual({ dynamicQuery: REFUNDED_ORDERS });
  });
});

describe("mockDataAppQueryError", () => {
  it("rejects query with mocked API error", async () => {
    setup({
      dataAppQueries: [
        mockDataAppQueryError(ORDERS_QUERY, {
          status: 403,
          message: "No access",
        }),
      ],
    });

    expect(
      await screen.findByText(
        JSON.stringify({ status: 403, data: { message: "No access" } }),
      ),
    ).toBeInTheDocument();
  });

  it("rejects only requests with mocked dynamic part", async () => {
    setup({
      status: "refunded",
      dataAppQueries: [
        mockDataAppQuery(ORDERS_QUERY, [{ id: 1, status: "paid" }]),
        mockDataAppQueryError(ORDERS_QUERY, REFUNDED_ORDERS, { status: 500 }),
      ],
    });

    expect(await screen.findByText(/"status":500/)).toBeInTheDocument();
  });
});
