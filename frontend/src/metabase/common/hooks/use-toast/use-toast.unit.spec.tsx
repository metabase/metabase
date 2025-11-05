import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";

import { useToast } from "./use-toast";

const TEST_TOAST_ID = 8675309;

const TestComponent = () => {
  const [sendToast, removeToast] = useToast();
  return (
    <div>
      <button
        onClick={() =>
          sendToast({
            // @ts-expect-error - we shouldn't hardcode ids in application code
            id: TEST_TOAST_ID,
            message: "Yeah Toast!",
            icon: "check_filled",
            timeout: 9000,
          })
        }
      >
        Send Toast
      </button>
      <button onClick={() => removeToast(TEST_TOAST_ID)}>Remove Toast</button>
      <UndoListing />
    </div>
  );
};

const setup = async () => {
  await renderWithProviders(<TestComponent />, { storeInitialState: {} });
};

describe("useToast hook", () => {
  it("should send a toast", async () => {
    setup();

    const sendButton = screen.getByText("Send Toast");
    await userEvent.click(sendButton);
    expect(await screen.findByText("Yeah Toast!")).toBeInTheDocument();
  });

  it("should remove a toast", async () => {
    setup();

    const sendButton = screen.getByText("Send Toast");
    await userEvent.click(sendButton);
    expect(await screen.findByText("Yeah Toast!")).toBeInTheDocument();

    const removeButton = screen.getByText("Remove Toast");
    await userEvent.click(removeButton);

    await waitFor(() => {
      expect(screen.queryByText("Yeah Toast!")).not.toBeInTheDocument();
    });
  });
});
