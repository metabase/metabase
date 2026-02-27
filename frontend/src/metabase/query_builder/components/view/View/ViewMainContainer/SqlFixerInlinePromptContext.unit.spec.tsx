import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import {
  SqlFixerInlinePromptProvider,
  useRegisterSqlFixerInlineContextProvider,
  useSqlFixerInlinePrompt,
} from "./SqlFixerInlinePromptContext";

function Registration({
  requestSqlFixPrompt,
}: {
  requestSqlFixPrompt: (prompt: string) => Promise<void>;
}) {
  useRegisterSqlFixerInlineContextProvider(requestSqlFixPrompt, [
    requestSqlFixPrompt,
  ]);
  return null;
}

function PromptState() {
  const { requestSqlFixPrompt } = useSqlFixerInlinePrompt();
  return (
    <div data-testid="request-fix-state">
      {requestSqlFixPrompt ? "callable" : "null"}
    </div>
  );
}

function InvokeRequestButton() {
  const { requestSqlFixPrompt } = useSqlFixerInlinePrompt();
  return (
    <button
      data-testid="invoke-request"
      onClick={() => requestSqlFixPrompt?.("Fix this SQL query")}
    />
  );
}

function Harness({
  initialRegistered,
  requestSqlFixPrompt,
}: {
  initialRegistered: boolean;
  requestSqlFixPrompt: (prompt: string) => Promise<void>;
}) {
  const [isRegistered, setIsRegistered] = useState(initialRegistered);

  return (
    <SqlFixerInlinePromptProvider>
      {isRegistered && (
        <Registration requestSqlFixPrompt={requestSqlFixPrompt} />
      )}
      <PromptState />
      <InvokeRequestButton />
      <button
        data-testid="toggle-registration"
        onClick={() => setIsRegistered((registered) => !registered)}
      />
    </SqlFixerInlinePromptProvider>
  );
}

describe("SqlFixerInlinePromptContext", () => {
  it("should register and unregister request callback", async () => {
    const requestSqlFixPrompt = jest.fn(async () => {});

    renderWithProviders(
      <Harness
        initialRegistered={true}
        requestSqlFixPrompt={requestSqlFixPrompt}
      />,
    );

    expect(await screen.findByTestId("request-fix-state")).toHaveTextContent(
      "callable",
    );

    await userEvent.click(await screen.findByTestId("toggle-registration"));

    await waitFor(() => {
      expect(screen.getByTestId("request-fix-state")).toHaveTextContent("null");
    });

    await userEvent.click(await screen.findByTestId("toggle-registration"));

    await waitFor(() => {
      expect(screen.getByTestId("request-fix-state")).toHaveTextContent(
        "callable",
      );
    });
  });

  it("should expose callable request when registered and null otherwise", async () => {
    const requestSqlFixPrompt = jest.fn(async () => {});

    renderWithProviders(
      <Harness
        initialRegistered={false}
        requestSqlFixPrompt={requestSqlFixPrompt}
      />,
    );

    expect(await screen.findByTestId("request-fix-state")).toHaveTextContent(
      "null",
    );

    await userEvent.click(await screen.findByTestId("invoke-request"));
    expect(requestSqlFixPrompt).not.toHaveBeenCalled();

    await userEvent.click(await screen.findByTestId("toggle-registration"));

    await waitFor(() => {
      expect(screen.getByTestId("request-fix-state")).toHaveTextContent(
        "callable",
      );
    });

    await userEvent.click(await screen.findByTestId("invoke-request"));

    await waitFor(() => {
      expect(requestSqlFixPrompt).toHaveBeenCalledWith("Fix this SQL query");
    });
  });
});
