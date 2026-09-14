import userEvent from "@testing-library/user-event";

import { render, screen, waitFor } from "__support__/ui";
import { Form, FormProvider, FormSwitch } from "metabase/forms";

import { FormInlineUpdater } from "./FormInlineUpdater";

type FormValues = {
  enabled: boolean;
};

describe("FormInlineUpdater", () => {
  it("rolls back form values when an update fails", async () => {
    const error = new Error("Update failed");
    const update = jest.fn().mockRejectedValue(error);
    const onError = jest.fn();

    render(
      <FormProvider<FormValues>
        initialValues={{ enabled: false }}
        onSubmit={jest.fn()}
      >
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
});
