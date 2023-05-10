
import React from "react";
import fetchMock from "fetch-mock";
import { setupMostRecentlyViewedDashboard, setupCollectionsEndpoints, setupSearchEndpoints, setupSingleCollectionEndpoint } from "__support__/server-mocks";
import userEvent from "@testing-library/user-event";

import { fireEvent, renderWithProviders, screen, waitFor, waitForElementToBeRemoved } from "__support__/ui";
import { AddToDashSelectDashModal } from "./AddToDashSelectDashModal";
import { createMockCard, createMockCollection, createMockDashboard } from "metabase-types/api/mocks";
import { Collection } from "metabase-types/api";
import { Route } from "react-router";

const card = createMockCard({ id: 1, name: "Model Uno", dataset: true });
const dashboard = createMockDashboard({ id: 1, name: 'Test dashboard', collection_id: 2 });

const dashboards = {
    1: dashboard
}

const COLLECTION_1 = createMockCollection({
    id: 2,
    name: "C1",
    can_write: true,
});

const COLLECTION_2 = createMockCollection({
    id: 3,
    name: "C2",
    can_write: true,
});

interface SetupOpts {
    collections?: Collection[];
    error?: string
}

const COLLECTIONS = [COLLECTION_1, COLLECTION_2];

const setup = ({ collections = COLLECTIONS, error }: SetupOpts = {}) => {
    const onChangeLocationMocked = jest.fn();
    const onCloseMocked = jest.fn();
    setupMostRecentlyViewedDashboard(dashboard);
    setupSearchEndpoints([]);
    setupCollectionsEndpoints(collections);

    fetchMock.get("path:/api/collection/2/items", []);

    if (!error) {
        setupSingleCollectionEndpoint(COLLECTION_1);
    } else {
        fetchMock.get("path:/api/collection/2", { status: 500, body: error })
    }

    renderWithProviders(
        <Route
            path="/"
            component={() => (
                <AddToDashSelectDashModal
                    card={card}
                    onChangeLocation={onChangeLocationMocked}
                    onClose={onCloseMocked}
                    dashboards={dashboards}
                />
            )}
        />, { withRouter: true }
    )

    return {
        onChangeLocationMocked,
        onCloseMocked
    }
}

describe("AddToDashSelectDashModal", () => {
    describe("Create new Dashboard", () => {
        it("should open CreateDashboardModal", async () => {
            setup();

            await waitForElementToBeRemoved(() =>
                screen.queryByTestId("loading-spinner")
            )

            const createNewDashboard = screen.getByRole('heading', {
                name: /create a new dashboard/i
            });

            fireEvent.click(createNewDashboard);

            screen.logTestingPlaygroundURL();

            // opened CreateDashboardModal
            expect(screen.getByRole('heading', {
                name: /new dashboard/i
            })).toBeInTheDocument();
        })
    })

    describe("Add to existing Dashboard", () => {
        it("should show loading", () => {
            setup();

            expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
        });
        
// TODO: find a way to fix throw error in redux utils
        it.skip("should show error", async () => {
            setup({ error: "Server Error!" });


            await waitForElementToBeRemoved(() =>
                screen.queryByTestId("loading-spinner")
            )

            expect(screen.getByText("Server Error!")).toBeInTheDocument();
        });

        describe("when user visited some dashboard in last 24hrs", () => {
            it("should preselected last visited dashboard in the picker", () => {
                // mock get_most_recently_viewed_dashboard
            })
        })

        describe("when user didn't visit any dashboard during last 24hrs", () => {
            it("should render root collection without preselection", () => {
                // mock get_most_recently_viewed_dashboard

            })
        })
    })
})