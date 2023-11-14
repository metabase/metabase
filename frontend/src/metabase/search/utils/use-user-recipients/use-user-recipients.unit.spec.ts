import { renderHook } from "@testing-library/react-hooks";
import { setupUserRecipientsEndpoint } from "__support__/server-mocks";
import { createMockUserListResult } from "metabase-types/api/mocks";
import { useUserRecipients } from "metabase/search/utils/use-user-recipients/use-user-recipients";

const TEST_USERS = [
  createMockUserListResult(),
  createMockUserListResult({
    id: 2,
    first_name: "John",
    last_name: "Cena",
    common_name: "John Cena",
  }),
];

type SetupOptions = {
  responseStatus?: number;
};

const setup = ({ responseStatus = 200 }: SetupOptions = {}) => {
  const mockUserRecipientsEndpoint = setupUserRecipientsEndpoint({
    users: TEST_USERS,
    responseStatus,
  });

  return {
    mockUserRecipientsEndpoint,
  };
};
describe("useUserRecipients", () => {
  it("should initially return loading when the hook is initializing and fetching data", async () => {
    setup();

    const { result, waitForNextUpdate } = renderHook(() => useUserRecipients());

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe(null);
    expect(result.current.error).toBe(null);

    // Removes the "not wrapped in act(...)" warning
    // https://github.com/testing-library/react-hooks-testing-library/issues/406#issuecomment-659019080
    await waitForNextUpdate();
  });

  it("should return the data when the hook is done fetching data", async () => {
    setup();
    const { result, waitForNextUpdate } = renderHook(() => useUserRecipients());
    await waitForNextUpdate();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(TEST_USERS);
  });

  it("should not call the API more than once once the data has been loaded", async () => {
    const { mockUserRecipientsEndpoint } = setup();

    for (let i = 0; i < 5; i++) {
      const { result, waitForNextUpdate } = renderHook(() =>
        useUserRecipients(),
      );
      await waitForNextUpdate();
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toEqual(TEST_USERS);
    }

    expect(mockUserRecipientsEndpoint.calls().length).toBe(1);
  });

  it("should return an error when the API call fails", async () => {
    const { mockUserRecipientsEndpoint } = setup({
      responseStatus: 500,
    });

    const { result, waitForNextUpdate } = renderHook(() => useUserRecipients());
    await waitForNextUpdate();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe(null);
    expect(result.current.error).not.toBe(null);
    expect(mockUserRecipientsEndpoint.calls().length).toBe(1);
  });
});
