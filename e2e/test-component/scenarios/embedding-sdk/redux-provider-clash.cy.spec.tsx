import {
  MetabaseProvider,
  StaticDashboard,
} from "@metabase/embedding-sdk-react";
import { configureStore, createSlice } from "@reduxjs/toolkit";
import { Provider, useDispatch, useSelector } from "react-redux";

import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import { getMetabaseInstanceUrl } from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

describe("scenarios > embedding-sdk > the redux provider context should not clash with the host app", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    cy.signOut();

    mockAuthProviderAndJwtSignIn();
  });

  it("the host app redux logic should work normally even inside MetabaseProvider", () => {
    cy.mount(
      <Provider store={customerStore}>
        <div data-testid="outside-metabase-provider">
          <CounterButton />
        </div>
        <MetabaseProvider
          authConfig={{
            metabaseInstanceUrl: getMetabaseInstanceUrl(),
          }}
        >
          <div data-testid="inside-metabase-provider">
            <CounterButton />
          </div>
          <StaticDashboard dashboardId={ORDERS_DASHBOARD_ID} withDownloads />
        </MetabaseProvider>
      </Provider>,
    );

    // the button should render and access the correct redux state both inside and outside the MetabaseProvider
    cy.findByTestId("outside-metabase-provider")
      .findByText("0")
      .should("exist");
    cy.findByTestId("inside-metabase-provider").findByText("0").should("exist");

    // sanity check that it's actually working and actions work
    cy.findByTestId("inside-metabase-provider").findByText("0").click();
    cy.findByTestId("outside-metabase-provider")
      .findByText("1")
      .should("exist");
    cy.findByTestId("inside-metabase-provider").findByText("1").should("exist");

    // also make sure the sdk is working, most data goes through redux so if it renders
    // it means it's working
    getSdkRoot().findByText("Orders in a dashboard").should("exist");
    getSdkRoot().findByText("Product ID").should("exist");
  });
});

// sample code for customer app
const slice = createSlice({
  name: "counter",
  initialState: {
    value: 0,
  },
  reducers: {
    increment: (state) => {
      state.value += 1;
    },
  },
});
const { increment } = slice.actions;
const customerStore = configureStore({
  reducer: {
    counter: slice.reducer,
  },
});

const CounterButton = () => {
  const count = useSelector(
    (state: { counter: { value: number } }) => state.counter.value,
  );
  const dispatch = useDispatch();
  return <button onClick={() => dispatch(increment())}>{count}</button>;
};
