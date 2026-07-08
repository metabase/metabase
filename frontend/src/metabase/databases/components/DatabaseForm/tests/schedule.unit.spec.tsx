import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";

import { setup } from "./setup";

const fillConnection = async () => {
  await userEvent.type(screen.getByLabelText("Display name"), "My DB");
  await userEvent.type(
    screen.getByLabelText("Connection String"),
    "file:/somewhere",
  );
};

const openAdvancedOptions = async () => {
  await userEvent.click(screen.getByText("Show advanced options"));
};

// Enabling "Choose when syncs and scans happen" (let-user-control-scheduling) flips is_full_sync to false, which
// reveals the sync/cache schedule controls in their "none" (Never) state.
const enableScheduling = async () => {
  await userEvent.click(
    screen.getByLabelText(/Choose when syncs and scans happen/),
  );
};

const chooseScheduleMode = async (current: string, next: string) => {
  await userEvent.click(await screen.findByDisplayValue(current));
  const listbox = await screen.findByRole("listbox");
  await userEvent.click(within(listbox).getByText(next));
};

const save = async () => {
  const saveButton = screen.getByRole("button", { name: "Save" });
  await waitFor(() => expect(saveButton).toBeEnabled());
  await userEvent.click(saveButton);
};

describe("DatabaseForm scheduling", () => {
  it("submits auto_run_queries=false when 'Rerun queries' is turned off (metabase#13187)", async () => {
    const { onSubmit } = setup();
    await fillConnection();
    await openAdvancedOptions();

    await userEvent.click(
      screen.getByLabelText(/Rerun queries for simple explorations/),
    );

    await save();
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ auto_run_queries: false }),
      );
    });
  });

  it("submits is_full_sync=false when the user takes control of scheduling", async () => {
    const { onSubmit } = setup();
    await fillConnection();
    await openAdvancedOptions();

    await enableScheduling();

    await save();
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ is_full_sync: false, is_on_demand: false }),
      );
    });
  });

  it("submits is_on_demand=true for 'Only when adding a new filter widget' (metabase#57198)", async () => {
    const { onSubmit } = setup();
    await fillConnection();
    await openAdvancedOptions();
    await enableScheduling();

    await chooseScheduleMode(
      "Never, I'll do this manually if I need to",
      "Only when adding a new filter widget",
    );

    await save();
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ is_full_sync: false, is_on_demand: true }),
      );
    });
  });

  it("submits a daily cache schedule for 'Regularly, on a schedule' (metabase#57198)", async () => {
    const { onSubmit } = setup();
    await fillConnection();
    await openAdvancedOptions();
    await enableScheduling();

    await chooseScheduleMode(
      "Never, I'll do this manually if I need to",
      "Regularly, on a schedule",
    );

    await save();
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          is_full_sync: true,
          is_on_demand: false,
          schedules: expect.objectContaining({
            cache_field_values: expect.objectContaining({
              schedule_type: "daily",
            }),
          }),
        }),
      );
    });
  });

  it("renders the saved cache schedule mode for an existing database (round-trip)", async () => {
    setup({
      initialValues: {
        id: 1,
        name: "My DB",
        details: {
          db: "file:/somewhere",
          "let-user-control-scheduling": true,
        },
        is_full_sync: false,
        is_on_demand: true,
      },
    });
    await openAdvancedOptions();

    expect(
      await screen.findByDisplayValue("Only when adding a new filter widget"),
    ).toBeInTheDocument();
  });
});
