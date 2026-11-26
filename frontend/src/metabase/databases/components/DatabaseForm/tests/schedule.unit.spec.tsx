import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
import type { ScheduleSettings } from "metabase-types/api";

import { type SetupOpts, setup } from "./setup";

const FULL_MODE = "Regularly, on a schedule";
const FULL_USED_MODE = "Regularly, on a schedule, only for filters people used";
const ON_DEMAND_MODE = "Only when adding a new filter widget";
const NONE_MODE = "Never, I'll do this manually if I need to";
const FULL_USED_HELP_TEXT =
  /only if someone opened its filter values since the last scan/;

const WEEKLY_SCHEDULE: ScheduleSettings = {
  schedule_type: "weekly",
  schedule_day: "tue",
  schedule_frame: null,
  schedule_hour: 5,
};

const setupExistingDatabase = ({
  initialValues,
}: Pick<SetupOpts, "initialValues"> = {}) =>
  setup({
    initialValues: {
      id: 1,
      name: "My DB",
      details: {
        db: "file:/somewhere",
        "let-user-control-scheduling": true,
      },
      is_full_sync: true,
      is_on_demand: false,
      schedules: { cache_field_values: WEEKLY_SCHEDULE },
      ...initialValues,
    },
  });

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

const save = async (name = "Save") => {
  const saveButton = screen.getByRole("button", { name });
  await waitFor(() => expect(saveButton).toBeEnabled());
  await userEvent.click(saveButton);
};

const saveChanges = () => save("Save changes");

describe("DatabaseForm scheduling", () => {
  it("submits auto_run_queries=false when 'Rerun queries' is turned off (metabase#13187)", async () => {
    const { onSubmit } = await setup();
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
    const { onSubmit } = await setup();
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
    const { onSubmit } = await setup();
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
    const { onSubmit } = await setup();
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
    await setup({
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

  describe("scanning only the filter values people used", () => {
    it("shows the mode and the schedule for an existing database that has the setting", async () => {
      await setupExistingDatabase({
        initialValues: { settings: { "scan-only-used-field-values": true } },
      });
      await openAdvancedOptions();

      expect(
        await screen.findByDisplayValue(FULL_USED_MODE),
      ).toBeInTheDocument();
      expect(screen.getByDisplayValue("Tuesday")).toBeInTheDocument();
      expect(screen.getByText(FULL_USED_HELP_TEXT)).toBeInTheDocument();
    });

    it("shows 'Regularly, on a schedule' without the help text when the setting is off", async () => {
      await setupExistingDatabase({
        initialValues: { settings: { "scan-only-used-field-values": false } },
      });
      await openAdvancedOptions();

      expect(await screen.findByDisplayValue(FULL_MODE)).toBeInTheDocument();
      expect(screen.getByDisplayValue("Tuesday")).toBeInTheDocument();
      expect(screen.queryByText(FULL_USED_HELP_TEXT)).not.toBeInTheDocument();
    });

    it("submits the setting and keeps the schedule when the mode is picked", async () => {
      const { onSubmit } = await setupExistingDatabase();
      await openAdvancedOptions();

      await chooseScheduleMode(FULL_MODE, FULL_USED_MODE);
      expect(
        await screen.findByDisplayValue(FULL_USED_MODE),
      ).toBeInTheDocument();
      expect(screen.getByDisplayValue("Tuesday")).toBeInTheDocument();
      expect(screen.getByText(FULL_USED_HELP_TEXT)).toBeInTheDocument();

      await saveChanges();
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            is_full_sync: true,
            is_on_demand: false,
            settings: { "scan-only-used-field-values": true },
            schedules: expect.objectContaining({
              cache_field_values: WEEKLY_SCHEDULE,
            }),
          }),
        );
      });
    });

    it("sets the default schedule when the mode is picked from a mode without a schedule", async () => {
      const { onSubmit } = await setupExistingDatabase({
        initialValues: {
          is_full_sync: false,
          schedules: { cache_field_values: null },
        },
      });
      await openAdvancedOptions();

      await chooseScheduleMode(NONE_MODE, FULL_USED_MODE);

      await saveChanges();
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            is_full_sync: true,
            is_on_demand: false,
            settings: { "scan-only-used-field-values": true },
            schedules: expect.objectContaining({
              cache_field_values: expect.objectContaining({
                schedule_type: "daily",
              }),
            }),
          }),
        );
      });
    });

    it("turns the setting off and keeps the schedule when 'Regularly, on a schedule' is picked", async () => {
      const { onSubmit } = await setupExistingDatabase({
        initialValues: { settings: { "scan-only-used-field-values": true } },
      });
      await openAdvancedOptions();

      await chooseScheduleMode(FULL_USED_MODE, FULL_MODE);
      expect(await screen.findByDisplayValue(FULL_MODE)).toBeInTheDocument();
      expect(screen.queryByText(FULL_USED_HELP_TEXT)).not.toBeInTheDocument();

      await saveChanges();
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            is_full_sync: true,
            is_on_demand: false,
            settings: { "scan-only-used-field-values": false },
            schedules: expect.objectContaining({
              cache_field_values: WEEKLY_SCHEDULE,
            }),
          }),
        );
      });
    });

    it.each([
      { mode: ON_DEMAND_MODE, is_on_demand: true },
      { mode: NONE_MODE, is_on_demand: false },
    ])(
      "turns the setting off when '$mode' is picked",
      async ({ mode, is_on_demand }) => {
        const { onSubmit } = await setupExistingDatabase({
          initialValues: { settings: { "scan-only-used-field-values": true } },
        });
        await openAdvancedOptions();

        await chooseScheduleMode(FULL_USED_MODE, mode);

        await saveChanges();
        await waitFor(() => {
          expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({
              is_full_sync: false,
              is_on_demand,
              settings: { "scan-only-used-field-values": false },
            }),
          );
        });
      },
    );

    it("turns the setting off when the user gives up control of scheduling", async () => {
      const { onSubmit } = await setupExistingDatabase({
        initialValues: { settings: { "scan-only-used-field-values": true } },
      });
      await openAdvancedOptions();

      await userEvent.click(
        screen.getByLabelText(/Choose when syncs and scans happen/),
      );
      expect(
        screen.queryByDisplayValue(FULL_USED_MODE),
      ).not.toBeInTheDocument();

      await saveChanges();
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            is_full_sync: true,
            is_on_demand: false,
            settings: { "scan-only-used-field-values": false },
          }),
        );
      });
    });

    it("submits only this setting when the database has other settings", async () => {
      const { onSubmit } = await setupExistingDatabase({
        initialValues: { settings: { "database-enable-actions": true } },
      });
      await openAdvancedOptions();

      await chooseScheduleMode(FULL_MODE, FULL_USED_MODE);

      await saveChanges();
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            settings: { "scan-only-used-field-values": true },
          }),
        );
      });
    });

    it.each([
      { title: "no settings", settings: null },
      {
        title: "other settings",
        settings: { "database-enable-actions": true },
      },
    ])(
      "does not submit settings when a database with $title keeps its scan mode",
      async ({ settings }) => {
        const { onSubmit } = await setupExistingDatabase({
          initialValues: { settings },
        });
        await openAdvancedOptions();

        await userEvent.click(
          screen.getByLabelText(/Rerun queries for simple explorations/),
        );

        await saveChanges();
        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
        const submittedValues: unknown = onSubmit.mock.lastCall?.[0];
        expect(submittedValues).not.toHaveProperty("settings");
      },
    );

    it("submits the setting the database already has when the scan mode is not changed", async () => {
      const { onSubmit } = await setupExistingDatabase({
        initialValues: { settings: { "scan-only-used-field-values": true } },
      });
      await openAdvancedOptions();

      await userEvent.click(
        screen.getByLabelText(/Rerun queries for simple explorations/),
      );

      await saveChanges();
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            settings: { "scan-only-used-field-values": true },
          }),
        );
      });
    });

    it("does not offer the mode or submit settings for a new database", async () => {
      const { onSubmit } = await setup();
      await fillConnection();
      await openAdvancedOptions();
      await enableScheduling();

      await userEvent.click(await screen.findByDisplayValue(NONE_MODE));
      const listbox = await screen.findByRole("listbox");
      expect(within(listbox).getByText(FULL_MODE)).toBeInTheDocument();
      expect(
        within(listbox).queryByText(FULL_USED_MODE),
      ).not.toBeInTheDocument();

      await userEvent.click(within(listbox).getByText(FULL_MODE));

      await save();
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      const submittedValues: unknown = onSubmit.mock.lastCall?.[0];
      expect(submittedValues).not.toHaveProperty("settings");
    });
  });
});
