import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import type { MetabaseDashboard } from "embedding-sdk-bundle/types/dashboard";
import { CreateDashboardModal } from "embedding-sdk-package/components/public/CreateDashboardModal";
import { StaticQuestion } from "embedding-sdk-package/components/public/StaticQuestion";
import { StaticDashboard } from "embedding-sdk-package/components/public/dashboard/StaticDashboard";

import { MetabaseTestProvider } from "./components/MetabaseTestProvider";
import {
  mockCreateDashboardModal,
  mockStaticDashboard,
  mockStaticQuestion,
} from "./mock-components";

const CREATED_DASHBOARD: MetabaseDashboard = {
  id: 7,
  entity_id: "createdDashboardEntity",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  name: "Q3 revenue",
  description: null,
  "last-edit-info": {
    id: 1,
    email: "ada@example.com",
    first_name: "Ada",
    last_name: "Lovelace",
    timestamp: "2024-01-01T00:00:00Z",
  },
};

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

describe("component mocks", () => {
  it("renders mock with props app passed to SDK component", async () => {
    mockStaticQuestion(({ questionId }) => <p>Question {questionId}</p>);

    render(
      <MetabaseTestProvider>
        <StaticQuestion questionId={42} />
      </MetabaseTestProvider>,
    );

    expect(await screen.findByText("Question 42")).toBeInTheDocument();
  });

  it("renders mock component that uses hooks", async () => {
    mockStaticDashboard(ClickCounter);

    render(
      <MetabaseTestProvider>
        <StaticDashboard dashboardId={1} />
      </MetabaseTestProvider>,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Clicked 0 times" }),
    );

    expect(
      screen.getByRole("button", { name: "Clicked 1 times" }),
    ).toBeInTheDocument();
  });

  it("lets mock call SDK component callbacks", async () => {
    mockCreateDashboardModal(({ onCreate }) => (
      <button onClick={() => onCreate(CREATED_DASHBOARD)}>
        Create dashboard
      </button>
    ));

    render(
      <MetabaseTestProvider>
        <NewDashboardFlow />
      </MetabaseTestProvider>,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Create dashboard" }),
    );

    expect(screen.getByText("Opened Q3 revenue")).toBeInTheDocument();
  });

  it("renders only children of unmocked SDK components", async () => {
    render(
      <MetabaseTestProvider>
        <StaticQuestion questionId={42}>
          <p>Custom layout</p>
        </StaticQuestion>
        <StaticDashboard dashboardId={1} />
      </MetabaseTestProvider>,
    );

    expect(await screen.findByText("Custom layout")).toBeInTheDocument();
  });

  it("drops mocks when provider unmounts", async () => {
    mockStaticQuestion(({ questionId }) => <p>Question {questionId}</p>);

    const { unmount } = render(
      <MetabaseTestProvider>
        <StaticQuestion questionId={42} />
      </MetabaseTestProvider>,
    );
    await screen.findByText("Question 42");

    unmount();
    await waitFor(() =>
      expect(window.METABASE_EMBEDDING_SDK_BUNDLE).toBeUndefined(),
    );

    render(
      <MetabaseTestProvider>
        <StaticQuestion questionId={42}>
          <p>Default output</p>
        </StaticQuestion>
      </MetabaseTestProvider>,
    );

    expect(await screen.findByText("Default output")).toBeInTheDocument();
    expect(screen.queryByText("Question 42")).not.toBeInTheDocument();
  });
});
