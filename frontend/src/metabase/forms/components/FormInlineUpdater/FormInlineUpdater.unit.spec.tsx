import userEvent from "@testing-library/user-event";

import { act, render, screen, waitFor } from "__support__/ui";
import { Form, FormProvider, FormSwitch } from "metabase/forms";
import { defer } from "metabase/utils/promise";

import { FormInlineUpdater } from "./FormInlineUpdater";

const DEBOUNCE_MS = 300;

type FormValues = {
  enabled: boolean;
  archived: boolean;
};

type SetupOpts = {
  update: (values: FormValues) => Promise<void>;
};

function setup({ update }: SetupOpts) {
  const onSuccess = jest.fn();
  const onError = jest.fn();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

  const { unmount } = render(
    <FormProvider
      initialValues={{ enabled: false, archived: false }}
      onSubmit={jest.fn()}
    >
      <Form>
        <FormInlineUpdater
          update={update}
          onSuccess={onSuccess}
          onError={onError}
          debounceMs={DEBOUNCE_MS}
        />
        <FormSwitch name="enabled" label="Enabled" />
        <FormSwitch name="archived" label="Archived" />
      </Form>
    </FormProvider>,
  );

  return {
    user,
    unmount,
    onSuccess,
    onError,
    enabledSwitch: screen.getByRole("switch", { name: "Enabled" }),
    archivedSwitch: screen.getByRole("switch", { name: "Archived" }),
  };
}

function advanceTimers(ms: number) {
  return act(() => jest.advanceTimersByTimeAsync(ms));
}

function settle(settleUpdate: () => void) {
  return act(async () => {
    settleUpdate();
    await jest.advanceTimersByTimeAsync(0);
  });
}

describe("FormInlineUpdater", () => {
  it("rolls back form values when an update fails", async () => {
    const error = new Error("Update failed");
    const update = jest.fn().mockRejectedValue(error);
    const onError = jest.fn();

    render(
      <FormProvider initialValues={{ enabled: false }} onSubmit={jest.fn()}>
        <Form>
          <FormInlineUpdater update={update} onError={onError} debounceMs={0} />
          <FormSwitch name="enabled" label="Enabled" />
        </Form>
      </FormProvider>,
    );

    const enabledSwitch = screen.getByRole("switch", { name: "Enabled" });
    await userEvent.click(enabledSwitch);

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({ enabled: true });
    });
    await waitFor(() => {
      expect(enabledSwitch).not.toBeChecked();
    });
    expect(onError).toHaveBeenCalledWith(error);
  });

  it("rolls back to the latest successful values", async () => {
    const error = new Error("Update failed");
    const update = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(error);
    const onError = jest.fn();

    render(
      <FormProvider
        initialValues={{ enabled: false, archived: false }}
        onSubmit={jest.fn()}
      >
        <Form>
          <FormInlineUpdater update={update} onError={onError} debounceMs={0} />
          <FormSwitch name="enabled" label="Enabled" />
          <FormSwitch name="archived" label="Archived" />
        </Form>
      </FormProvider>,
    );

    const enabledSwitch = screen.getByRole("switch", { name: "Enabled" });
    const archivedSwitch = screen.getByRole("switch", { name: "Archived" });

    await userEvent.click(enabledSwitch);
    await waitFor(() => {
      expect(update).toHaveBeenNthCalledWith(1, {
        enabled: true,
        archived: false,
      });
    });

    await userEvent.click(archivedSwitch);
    await waitFor(() => {
      expect(update).toHaveBeenNthCalledWith(2, {
        enabled: true,
        archived: true,
      });
    });
    await waitFor(() => {
      expect(enabledSwitch).toBeChecked();
      expect(archivedSwitch).not.toBeChecked();
    });
    expect(onError).toHaveBeenCalledWith(error);
  });

  it("rolls back to reinitialized values", async () => {
    const error = new Error("Update failed");
    const update = jest.fn().mockRejectedValue(error);
    const onError = jest.fn();
    const renderForm = (initialValues: {
      enabled: boolean;
      archived: boolean;
    }) => (
      <FormProvider
        initialValues={initialValues}
        onSubmit={jest.fn()}
        enableReinitialize
      >
        <Form>
          <FormInlineUpdater update={update} onError={onError} debounceMs={0} />
          <FormSwitch name="enabled" label="Enabled" />
          <FormSwitch name="archived" label="Archived" />
        </Form>
      </FormProvider>
    );

    const { rerender } = render(
      renderForm({ enabled: false, archived: false }),
    );
    rerender(renderForm({ enabled: true, archived: false }));

    const enabledSwitch = screen.getByRole("switch", { name: "Enabled" });
    const archivedSwitch = screen.getByRole("switch", { name: "Archived" });
    await waitFor(() => {
      expect(enabledSwitch).toBeChecked();
    });

    await userEvent.click(archivedSwitch);
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({ enabled: true, archived: true });
    });
    await waitFor(() => {
      expect(enabledSwitch).toBeChecked();
      expect(archivedSwitch).not.toBeChecked();
    });
    expect(onError).toHaveBeenCalledWith(error);
  });

  describe("debounced and queued updates", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("sends one update with the latest values once the debounce delay elapses", async () => {
      const update = jest.fn().mockResolvedValue(undefined);
      const { user, enabledSwitch, archivedSwitch } = setup({ update });

      await user.click(enabledSwitch);
      await user.click(archivedSwitch);
      await advanceTimers(DEBOUNCE_MS - 1);
      expect(update).not.toHaveBeenCalled();

      await advanceTimers(1);
      expect(update).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith({ enabled: true, archived: true });
    });

    it("does not send an update when the values return to the initial values within the debounce delay", async () => {
      const update = jest.fn().mockResolvedValue(undefined);
      const { user, enabledSwitch } = setup({ update });

      await user.click(enabledSwitch);
      await user.click(enabledSwitch);
      await advanceTimers(DEBOUNCE_MS);

      expect(update).not.toHaveBeenCalled();
      expect(enabledSwitch).not.toBeChecked();
    });

    it("sends only the latest values changed while an update is in flight", async () => {
      const firstUpdate = defer<void>();
      const update = jest
        .fn()
        .mockReturnValueOnce(firstUpdate.promise)
        .mockResolvedValue(undefined);
      const { user, onSuccess, enabledSwitch, archivedSwitch } = setup({
        update,
      });

      await user.click(enabledSwitch);
      await advanceTimers(DEBOUNCE_MS);
      await user.click(archivedSwitch);
      await advanceTimers(DEBOUNCE_MS);
      await user.click(enabledSwitch);
      await advanceTimers(DEBOUNCE_MS);
      expect(update).toHaveBeenCalledTimes(1);

      await settle(() => firstUpdate.resolve());

      expect(update).toHaveBeenCalledTimes(2);
      expect(update).toHaveBeenLastCalledWith({
        enabled: false,
        archived: true,
      });
      expect(onSuccess).toHaveBeenCalledTimes(2);
      expect(enabledSwitch).not.toBeChecked();
      expect(archivedSwitch).toBeChecked();
    });

    it("discards values queued behind an update that fails", async () => {
      const error = new Error("Update failed");
      const firstUpdate = defer<void>();
      const update = jest
        .fn()
        .mockReturnValueOnce(firstUpdate.promise)
        .mockResolvedValue(undefined);
      const { user, onError, enabledSwitch, archivedSwitch } = setup({
        update,
      });

      await user.click(enabledSwitch);
      await advanceTimers(DEBOUNCE_MS);
      await user.click(archivedSwitch);
      await advanceTimers(DEBOUNCE_MS);

      await settle(() => firstUpdate.reject(error));
      await advanceTimers(DEBOUNCE_MS);

      expect(update).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(enabledSwitch).not.toBeChecked();
      expect(archivedSwitch).not.toBeChecked();
    });

    it("does not send a change still waiting for the debounce delay when the update in flight fails", async () => {
      const firstUpdate = defer<void>();
      const update = jest
        .fn()
        .mockReturnValueOnce(firstUpdate.promise)
        .mockResolvedValue(undefined);
      const { user, enabledSwitch, archivedSwitch } = setup({ update });

      await user.click(enabledSwitch);
      await advanceTimers(DEBOUNCE_MS);
      await user.click(archivedSwitch);

      await settle(() => firstUpdate.reject(new Error("Update failed")));
      await advanceTimers(DEBOUNCE_MS);

      expect(update).toHaveBeenCalledTimes(1);
      expect(enabledSwitch).not.toBeChecked();
      expect(archivedSwitch).not.toBeChecked();
    });

    it("does not send a change still waiting for the debounce delay after unmount", async () => {
      const update = jest.fn().mockResolvedValue(undefined);
      const { user, unmount, enabledSwitch } = setup({ update });

      await user.click(enabledSwitch);
      unmount();
      await advanceTimers(DEBOUNCE_MS);

      expect(update).not.toHaveBeenCalled();
    });

    it("discards values queued before unmount when the update in flight fails", async () => {
      const error = new Error("Update failed");
      const firstUpdate = defer<void>();
      const update = jest
        .fn()
        .mockReturnValueOnce(firstUpdate.promise)
        .mockResolvedValue(undefined);
      const { user, unmount, onError, enabledSwitch, archivedSwitch } = setup({
        update,
      });

      await user.click(enabledSwitch);
      await advanceTimers(DEBOUNCE_MS);
      await user.click(archivedSwitch);
      await advanceTimers(DEBOUNCE_MS);
      unmount();

      await settle(() => firstUpdate.reject(error));
      await advanceTimers(DEBOUNCE_MS);

      expect(update).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(error);
    });

    it("sends values queued before unmount once the update in flight succeeds", async () => {
      const firstUpdate = defer<void>();
      const update = jest
        .fn()
        .mockReturnValueOnce(firstUpdate.promise)
        .mockResolvedValue(undefined);
      const { user, unmount, enabledSwitch, archivedSwitch } = setup({
        update,
      });

      await user.click(enabledSwitch);
      await advanceTimers(DEBOUNCE_MS);
      await user.click(archivedSwitch);
      await advanceTimers(DEBOUNCE_MS);
      unmount();

      await settle(() => firstUpdate.resolve());

      expect(update).toHaveBeenCalledTimes(2);
      expect(update).toHaveBeenLastCalledWith({
        enabled: true,
        archived: true,
      });
    });
  });
});
