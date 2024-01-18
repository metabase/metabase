import fetchMock from "fetch-mock";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { createMockUpload, createMockState } from "metabase-types/store/mocks";

import { renderWithProviders } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";
import CollectionHeader from "metabase/collections/containers/CollectionHeader";
import { FileUploadStatus } from "./FileUploadStatus";

describe("FileUploadStatus", () => {
  const firstCollectionId = 1;
  const firstCollection = createMockCollection({
    id: firstCollectionId,
    can_write: true,
  });

  const secondCollectionId = 2;

  beforeEach(() => {
    fetchMock.get("path:/api/collection/1", firstCollection);

    fetchMock.get(
      "path:/api/collection/2",
      createMockCollection({
        id: 2,
        name: "Second Collection",
      }),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
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
      await screen.findByText("Uploading data to Collection …"),
    ).toBeInTheDocument();

    expect(
      await screen.findByText("Uploading data to Second Collection …"),
    ).toBeInTheDocument();

    expect(await screen.findByText("test.csv")).toBeInTheDocument();

    expect(await screen.findByText("test two.csv")).toBeInTheDocument();

    expect(await screen.findByText("test three.csv")).toBeInTheDocument();
  });

  it("Should show a start exploring link on completion", async () => {
    jest.useFakeTimers({ advanceTimers: true });
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
                uploadsEnabled
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

    jest.advanceTimersByTime(500);

    expect(
      await screen.findByText("Uploading data to Collection …"),
    ).toBeInTheDocument();

    jest.advanceTimersByTime(1000);

    expect(
      await screen.findByRole("link", { name: "Start exploring" }),
    ).toHaveAttribute("href", "/model/3");
  });

  it("Should show an error message on error", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    fetchMock.post(
      "path:/api/card/from-csv",
      {
        throws: {
          data: { message: "Something went wrong", cause: "It's dead Jim" },
        },
        status: 400,
      },
      { delay: 1000 },
    ),
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
                  uploadsEnabled
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

    jest.advanceTimersByTime(500);

    expect(
      await screen.findByText("Uploading data to Collection …"),
    ).toBeInTheDocument();

    jest.advanceTimersByTime(500);

    expect(
      await screen.findByText("There was an error uploading the file"),
    ).toBeInTheDocument();

    userEvent.click(await screen.findByText("Show error details"));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  describe("loading state", () => {
    it("should rotate loading messages after 30 seconds", async () => {
      jest.useFakeTimers({ advanceTimers: true });
      fetchMock.post("path:/api/card/from-csv", "3", { delay: 90 * 1000 });

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
                  uploadsEnabled
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

      jest.advanceTimersByTime(1 * 1000);

      expect(
        await screen.findByText("Uploading data to Collection …"),
      ).toBeInTheDocument();

      jest.advanceTimersByTime(30 * 1000);

      expect(await screen.findByText("Still working …")).toBeInTheDocument();

      jest.advanceTimersByTime(30 * 1000);

      expect(
        await screen.findByText("Arranging bits and bytes …"),
      ).toBeInTheDocument();

      jest.advanceTimersByTime(30 * 1000);

      expect(
        await screen.findByRole("link", { name: "Start exploring" }),
      ).toHaveAttribute("href", "/model/3");
    });
  });
});
