import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type {
  TempStorage,
  TempStorageKey,
  TempStorageValue,
} from "metabase-types/store";
import {
  createMockAppState,
  createMockState,
} from "metabase-types/store/mocks";

import { useTempStorage } from "./use-temp-storage";

const TestComponent = ({
  entry,
  newValue,
}: {
  entry: TempStorageKey;
  newValue?: TempStorageValue;
}) => {
  const [value, setValue] = useTempStorage(entry);

  return (
    <div>
      <button onClick={() => setValue(newValue)} />
      <div data-testid="result">{`Value is: ${value}`}</div>
    </div>
  );
};

type SetupProps = {
  tempStorage: TempStorage;
  entry: TempStorageKey;
  newValue?: TempStorageValue;
};

const setup = ({ tempStorage, entry, newValue }: SetupProps) => {
  const initialState = createMockState({
    app: createMockAppState({ tempStorage }),
  });

  renderWithProviders(<TestComponent entry={entry} newValue={newValue} />, {
    storeInitialState: initialState,
  });
};

describe("useTempStorage hook", () => {
  it("should return undefined for uninitialized key", () => {
    const tempStorage = {
      "last-opened-onboarding-checklist-item": undefined,
    };

    setup({ tempStorage, entry: "last-opened-onboarding-checklist-item" });

    expect(screen.getByTestId("result")).toHaveTextContent(
      "Value is: undefined",
    );
  });

  it("should read and set the value", async () => {
    const tempStorage = {
      "last-opened-onboarding-checklist-item": "sql" as const,
    };

    setup({
      tempStorage,
      entry: "last-opened-onboarding-checklist-item",
      newValue: "dashboard",
    });

    expect(screen.getByTestId("result")).toHaveTextContent("Value is: sql");

    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("result")).toHaveTextContent(
      "Value is: dashboard",
    );
  });
});
