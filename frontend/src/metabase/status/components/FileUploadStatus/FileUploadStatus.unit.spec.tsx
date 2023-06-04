import fetchMock from "fetch-mock";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { createMockUpload, createMockState } from "metabase-types/store/mocks";

import { renderWithProviders } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";
import CollectionHeader from "metabase/collections/containers/CollectionHeader";
import FileUploadStatus from "./FileUploadStatus";

describe("FileUploadStatus", () => {
  const firstCollectionId = 1;
  const firstCollection = createMockCollection({ id: firstCollectionId });

  const secondCollectionId = 2;

  beforeEach(() => {
    fetchMock.get("path:/api/collection", [
      firstCollection,
      createMockCollection({
        id: secondCollectionId,
        name: "Second Collection",
      }),
    ]);
  });

  it("Should group uploads by collection", async () => {
    const uploadOne = createMockUpload({
      collectionId: firstCollectionId,
      id: 1,
    });

    const uploadTwo = createMockUpload({
      collectionId: secondCollectionId,
      id: 2,
      name: "test two.csv",
    });

    const uploadThree = createMockUpload({
      collectionId: firstCollectionId,
      id: 3,
      name: "test three.csv",
    });

    renderWithProviders(<FileUploadStatus />, {
      storeInitialState: createMockState({
        upload: {
          [uploadOne.id]: uploadOne,
          [uploadTwo.id]: uploadTwo,
          [uploadThree.id]: uploadThree,
        },
      }),
    });

    expect(
      await screen.findByText("Uploading data to Collection..."),
    ).toBeInTheDocument();

    expect(
      await screen.findByText("Uploading data to Second Collection..."),
    ).toBeInTheDocument();

    expect(await screen.findByText("test.csv")).toBeInTheDocument();

    expect(await screen.findByText("test two.csv")).toBeInTheDocument();

    expect(await screen.findByText("test three.csv")).toBeInTheDocument();
  });

  it("Should show a start exploring link on completion", async () => {
    fetchMock.post("path:/api/card/from-csv", "3", { delay: 1000 });

    renderWithProviders(
      <Route
        path="/"
        component={() => {
          return (
            <>
              <CollectionHeader
                collection={firstCollection}
                isAdmin={true}
                isBookmarked={false}
                isPersonalCollectionChild={false}
                onCreateBookmark={jest.fn()}
                onDeleteBookmark={jest.fn()}
                canUpload
              />
              <FileUploadStatus />
            </>
          );
        }}
      />,
      {
        withRouter: true,
      },
    );

    userEvent.upload(
      screen.getByTestId("upload-input"),
      new File(["foo, bar"], "test.csv", { type: "text/csv" }),
    );

    expect(
      await screen.findByText("Uploading data to Collection..."),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole(
        "link",
        { name: "Start exploring" },
        { timeout: 5000 },
      ),
    ).toHaveAttribute("href", "/model/3");
  });

  it("Should show an error message on error", async () => {
    fetchMock.post(
      "path:/api/card/from-csv",
      {
        throws: { data: { message: "It's dead Jim" } },
        status: 400,
      },
      { delay: 1000 },
    ),
      renderWithProviders(
        <Route
          path="/"
          component={props => {
            return (
              <>
                <CollectionHeader
                  collection={firstCollection}
                  isAdmin={true}
                  isBookmarked={false}
                  isPersonalCollectionChild={false}
                  onCreateBookmark={jest.fn()}
                  onDeleteBookmark={jest.fn()}
                  canUpload
                />
                <FileUploadStatus />
              </>
            );
          }}
        />,
        {
          withRouter: true,
        },
      );

    userEvent.upload(
      screen.getByTestId("upload-input"),
      new File(["foo, bar"], "test.csv", { type: "text/csv" }),
    );

    expect(
      await screen.findByText("Uploading data to Collection..."),
    ).toBeInTheDocument();

    expect(
      await screen.findByText(
        "Error uploading your File",
        {},
        { timeout: 3000 },
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("It's dead Jim")).toBeInTheDocument();
  });
});
