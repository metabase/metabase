import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";

import { InteractiveQuestion } from "embedding-sdk-package/components/public/InteractiveQuestion";
import { StaticQuestion } from "embedding-sdk-package/components/public/StaticQuestion";
import {
  SDK_COMPONENT_NOT_YET_AVAILABLE_MESSAGE,
  SDK_NOT_LOADED_YET_MESSAGE,
} from "embedding-sdk-package/constants/error-messages";
import { useApplicationName } from "embedding-sdk-package/hooks/public/use-application-name";
import { useDateFormatter } from "embedding-sdk-package/hooks/public/use-date-formatter";
import { useMetabaseAuthStatus } from "embedding-sdk-package/hooks/public/use-metabase-auth-status";
import { useMetabaseQuery } from "embedding-sdk-package/hooks/public/use-metabase-query";
import { defineQuery } from "embedding-sdk-package/hooks/public/use-metabase-query/define-query";

import { getMockSdkHandlers } from "../../lib/mock-sdk-handlers";

import { MetabaseTestProvider } from "./MetabaseTestProvider";

const ORDERS_QUERY = defineQuery({
  source: { type: "card", entityId: "ordersQuestionEntity" },
});

const SessionInfo = () => {
  const applicationName = useApplicationName();
  const authStatus = useMetabaseAuthStatus();

  return (
    <p>
      {applicationName} {authStatus?.status}
    </p>
  );
};

const DateRangeLabel = () => {
  const { formatDateRange } = useDateFormatter();

  return <p>{formatDateRange(["2024-01-01", "2024-01-31"])}</p>;
};

const OrdersQueryError = () => {
  const { error } = useMetabaseQuery(ORDERS_QUERY);

  return <p>{error instanceof Error ? error.message : "no error"}</p>;
};

describe("MetabaseTestProvider", () => {
  it("renders SDK components as their children", async () => {
    render(
      <MetabaseTestProvider>
        <StaticQuestion questionId={1}>
          <p>Orders by month</p>
        </StaticQuestion>
      </MetabaseTestProvider>,
    );

    expect(await screen.findByText("Orders by month")).toBeInTheDocument();
  });

  it("renders subcomponents of compound SDK components", async () => {
    render(
      <MetabaseTestProvider>
        <InteractiveQuestion questionId={1}>
          <InteractiveQuestion.Title />
          <p>Below title</p>
        </InteractiveQuestion>
      </MetabaseTestProvider>,
    );

    expect(await screen.findByText("Below title")).toBeInTheDocument();
    expect(
      screen.queryByText(SDK_COMPONENT_NOT_YET_AVAILABLE_MESSAGE),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(SDK_NOT_LOADED_YET_MESSAGE),
    ).not.toBeInTheDocument();
  });

  it("serves signed-in session to SDK hooks", async () => {
    render(
      <MetabaseTestProvider>
        <SessionInfo />
      </MetabaseTestProvider>,
    );

    expect(await screen.findByText("Metabase success")).toBeInTheDocument();
  });

  it("formats dates for date formatter hook", async () => {
    render(
      <MetabaseTestProvider>
        <DateRangeLabel />
      </MetabaseTestProvider>,
    );

    expect(
      await screen.findByText("January 1, 2024–January 31, 2024"),
    ).toBeInTheDocument();
  });

  it("rejects unmocked data requests", async () => {
    render(
      <MetabaseTestProvider>
        <OrdersQueryError />
      </MetabaseTestProvider>,
    );

    expect(
      await screen.findByText(/No mock for resolveDatasetQuery/),
    ).toBeInTheDocument();
  });

  it("keeps mocks registered before render through strict mode effect replay", async () => {
    getMockSdkHandlers().resolveDatasetQuery = () => () =>
      Promise.reject(new Error("Answered by registered mock"));

    render(
      <StrictMode>
        <MetabaseTestProvider>
          <OrdersQueryError />
        </MetabaseTestProvider>
      </StrictMode>,
    );

    expect(
      await screen.findByText("Answered by registered mock"),
    ).toBeInTheDocument();
  });

  it("removes mock SDK on unmount", async () => {
    const { unmount } = render(
      <MetabaseTestProvider>
        <StaticQuestion questionId={1} />
      </MetabaseTestProvider>,
    );

    expect(window.METABASE_EMBEDDING_SDK_BUNDLE).toBeDefined();

    unmount();

    await waitFor(() =>
      expect(window.METABASE_EMBEDDING_SDK_BUNDLE).toBeUndefined(),
    );
  });
});
