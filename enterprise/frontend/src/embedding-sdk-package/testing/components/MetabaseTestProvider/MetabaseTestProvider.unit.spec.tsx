import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";

import { CreateDashboardModal } from "embedding-sdk-package/components/public/CreateDashboardModal";
import { InteractiveQuestion } from "embedding-sdk-package/components/public/InteractiveQuestion";
import { StaticQuestion } from "embedding-sdk-package/components/public/StaticQuestion";
import { StaticDashboard } from "embedding-sdk-package/components/public/dashboard/StaticDashboard";
import {
  SDK_COMPONENT_NOT_YET_AVAILABLE_MESSAGE,
  SDK_NOT_LOADED_YET_MESSAGE,
} from "embedding-sdk-package/constants/error-messages";
import { useApplicationName } from "embedding-sdk-package/hooks/public/use-application-name";
import { useCurrentUser } from "embedding-sdk-package/hooks/public/use-current-user";
import { useDateFormatter } from "embedding-sdk-package/hooks/public/use-date-formatter";
import { useMetabaseAuthStatus } from "embedding-sdk-package/hooks/public/use-metabase-auth-status";
import { useMetabaseQuery } from "embedding-sdk-package/hooks/public/use-metabase-query";
import { defineQuery } from "embedding-sdk-package/hooks/public/use-metabase-query/define-query";
import { createMockDashboard } from "embedding-sdk-package/testing/lib/public/dashboard";
import { createMockUser } from "embedding-sdk-package/testing/lib/public/user";

import {
  MetabaseTestProvider,
  type MetabaseTestProviderProps,
} from "./MetabaseTestProvider";

function SessionInfo() {
  const applicationName = useApplicationName();
  const authStatus = useMetabaseAuthStatus();
  const user = useCurrentUser();

  return (
    <p>
      {applicationName} {authStatus?.status} {user?.first_name ?? "anonymous"}
    </p>
  );
}

function DateRangeLabel() {
  const { formatDateRange } = useDateFormatter();

  return <p>{formatDateRange(["2024-01-01", "2024-01-31"])}</p>;
}

function OrdersQueryError() {
  const { error } = useMetabaseQuery(ORDERS_QUERY);

  return <p>{error instanceof Error ? error.message : "no error"}</p>;
}

function NewDashboardFlow() {
  const [createdName, setCreatedName] = useState("");

  return (
    <div>
      <CreateDashboardModal
        onCreate={(dashboard) => setCreatedName(dashboard.name)}
      />
      {createdName && <p>Opened {createdName}</p>}
    </div>
  );
}

function ClickCounter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(count + 1)}>Clicked {count} times</button>
  );
}

function setup({ children, ...options }: MetabaseTestProviderProps = {}) {
  return render(
    <MetabaseTestProvider {...options}>{children}</MetabaseTestProvider>,
  );
}

const ORDERS_QUERY = defineQuery({
  source: { type: "card", entityId: "ordersQuestionEntity" },
});

const CREATED_DASHBOARD = createMockDashboard({ name: "Q3 revenue" });

describe("MetabaseTestProvider", () => {
  it("renders SDK components as their children", async () => {
    setup({
      children: (
        <StaticQuestion questionId={1}>
          <p>Orders by month</p>
        </StaticQuestion>
      ),
    });

    expect(await screen.findByText("Orders by month")).toBeInTheDocument();
  });

  it("renders subcomponents of compound SDK components", async () => {
    setup({
      children: (
        <InteractiveQuestion questionId={1}>
          <InteractiveQuestion.Title />
          <p>Below title</p>
        </InteractiveQuestion>
      ),
    });

    expect(await screen.findByText("Below title")).toBeInTheDocument();
    expect(
      screen.queryByText(SDK_COMPONENT_NOT_YET_AVAILABLE_MESSAGE),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(SDK_NOT_LOADED_YET_MESSAGE),
    ).not.toBeInTheDocument();
  });

  it("renders component passed for SDK component with its props", async () => {
    setup({
      StaticQuestion: ({ questionId }) => <p>Question {questionId}</p>,
      children: <StaticQuestion questionId={42} />,
    });

    expect(await screen.findByText("Question 42")).toBeInTheDocument();
  });

  it("renders component passed for SDK component that uses hooks", async () => {
    setup({
      StaticDashboard: ClickCounter,
      children: <StaticDashboard dashboardId={1} />,
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Clicked 0 times" }),
    );

    expect(
      screen.getByRole("button", { name: "Clicked 1 times" }),
    ).toBeInTheDocument();
  });

  it("lets component passed for SDK component call its callbacks", async () => {
    setup({
      CreateDashboardModal: ({ onCreate }) => (
        <button onClick={() => onCreate(CREATED_DASHBOARD)}>
          Create dashboard
        </button>
      ),
      children: <NewDashboardFlow />,
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Create dashboard" }),
    );

    expect(screen.getByText("Opened Q3 revenue")).toBeInTheDocument();
  });

  it("serves signed-in session by default", async () => {
    setup({ children: <SessionInfo /> });

    expect(
      await screen.findByText("Metabase success anonymous"),
    ).toBeInTheDocument();
  });

  it("serves passed user, login status and application name", async () => {
    setup({
      user: createMockUser({ first_name: "Ada" }),
      loginStatus: { status: "loading" },
      applicationName: "Acme Analytics",
      children: <SessionInfo />,
    });

    expect(
      await screen.findByText("Acme Analytics loading Ada"),
    ).toBeInTheDocument();
  });

  it("formats dates for date formatter hook", async () => {
    setup({ children: <DateRangeLabel /> });

    expect(
      await screen.findByText("January 1, 2024–January 31, 2024"),
    ).toBeInTheDocument();
  });

  it("rejects unmocked data requests", async () => {
    setup({ children: <OrdersQueryError /> });

    expect(
      await screen.findByText(/No mock for resolveDatasetQuery/),
    ).toBeInTheDocument();
  });

  it("keeps serving SDK through strict mode effect replay", async () => {
    render(
      <StrictMode>
        <MetabaseTestProvider applicationName="Acme Analytics">
          <SessionInfo />
        </MetabaseTestProvider>
      </StrictMode>,
    );

    expect(
      await screen.findByText("Acme Analytics success anonymous"),
    ).toBeInTheDocument();
  });

  it("removes mock SDK on unmount", async () => {
    const { unmount } = setup({
      children: <StaticQuestion questionId={1} />,
    });

    expect(window.METABASE_EMBEDDING_SDK_BUNDLE).toBeDefined();

    unmount();

    await waitFor(() =>
      expect(window.METABASE_EMBEDDING_SDK_BUNDLE).toBeUndefined(),
    );
  });
});
