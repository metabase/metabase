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
      {/* @ts-expect-error - The hook still doesn't accept any k/v pair */}
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

const setup = ({ tempStorage = {}, entry, newValue }: SetupProps) => {
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
      animal: undefined,
    };
    // @ts-expect-error - The hook still doesn't accept any k/v pair
    setup({ tempStorage, entry: "animal" });

    expect(screen.getByTestId("result")).toHaveTextContent(
      "Value is: undefined",
    );
  });

  it("should read and set the value", async () => {
    const tempStorage = {
      animal: "dog",
    };

    // @ts-expect-error - The hook still doesn't accept any k/v pair
    setup({ tempStorage, entry: "animal", newValue: "cat" });

    expect(screen.getByTestId("result")).toHaveTextContent("Value is: dog");

    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("result")).toHaveTextContent("Value is: cat");
  });
});
