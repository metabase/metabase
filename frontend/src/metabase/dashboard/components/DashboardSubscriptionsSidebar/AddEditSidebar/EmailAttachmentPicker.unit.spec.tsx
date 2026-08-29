import { mockSettings } from "__support__/settings";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { DashboardSubscription } from "metabase-types/api";

import { EmailAttachmentPicker } from "./EmailAttachmentPicker";

function setup({
  pulse = createPulse(),
  allowDownload = true,
  hasAttachments = false,
  includePdf = false,
  attachmentOnly = false,
} = {}) {
  const setPulse = jest.fn();

  if (hasAttachments) {
    pulse.cards[0]["include_xls"] = true;
  }

  if (includePdf || attachmentOnly) {
    pulse.channels = pulse.channels.map((channel) => ({
      ...channel,
      details: {
        ...channel.details,
        ...(includePdf ? { include_pdf: true } : {}),
        ...(attachmentOnly ? { attachment_only: true } : {}),
      },
    }));
  }

  const state = createMockState({
    settings: mockSettings({
      "application-name": "Metabase",
    }),
  });

  renderWithProviders(
    <EmailAttachmentPicker
      cards={pulse.cards}
      pulse={pulse}
      setPulse={setPulse}
      allowDownload={allowDownload}
    />,
    { storeInitialState: state },
  );

  return { setPulse };
}

describe("EmailAttachmentPicker", () => {
  describe("when instantiated without any cards with attachments", () => {
    it("should have a Toggle that is not toggled", () => {
      setup();
      const toggle = screen.getByLabelText("Attach results");
      expect(toggle).toBeInTheDocument();
      expect(toggle).not.toBeChecked();
    });

    it("should render disabled toggle if no access", () => {
      setup({ allowDownload: false });
      const toggle = screen.getByLabelText("Attach results");

      expect(toggle).toBeDisabled();
    });

    it("should have a clickable toggle that reveals attachment type and a checkbox per question", () => {
      setup();

      expect(screen.queryByText("File format")).not.toBeInTheDocument();
      expect(screen.queryByText("Questions to attach")).not.toBeInTheDocument();
      expect(screen.queryByText("card1")).not.toBeInTheDocument();
      expect(screen.queryByText("card2")).not.toBeInTheDocument();

      const toggle = screen.getByLabelText("Attach results");
      fireEvent.click(toggle);

      const csvFormatInput = screen.getByLabelText(".csv");
      expect(csvFormatInput).toBeChecked();

      const toggleAllCheckbox = screen.getByLabelText("Questions to attach");
      expect(toggleAllCheckbox).not.toBeChecked();

      const card1Checkbox = screen.getByLabelText("card1");
      expect(card1Checkbox).not.toBeChecked();

      const card2Checkbox = screen.getByLabelText("card2");
      expect(card2Checkbox).not.toBeChecked();
    });
  });

  describe("when instantiated with cards with attachments", () => {
    it("should have a toggled Toggle", () => {
      setup({ hasAttachments: true });
      const toggle = screen.getByLabelText("Attach results");
      expect(toggle).toBeInTheDocument();
      expect(toggle).toBeChecked();
    });

    it("should have selected the xlsv format", () => {
      setup({ hasAttachments: true });
      const csvFormatInput = screen.getByLabelText(".csv");
      expect(csvFormatInput).not.toBeChecked();
      const xlsxFormatInput = screen.getByLabelText(".xlsx");
      expect(xlsxFormatInput).toBeChecked();
    });

    it("should show a checked checkbox for the card with an attachment", () => {
      setup({ hasAttachments: true });

      const toggleAllCheckbox = screen.getByLabelText("Questions to attach");
      expect(toggleAllCheckbox).not.toBeChecked();

      const card1Checkbox = screen.getByLabelText("card1");
      expect(card1Checkbox).toBeChecked();

      const card2Checkbox = screen.getByLabelText("card2");
      expect(card2Checkbox).not.toBeChecked();
    });

    it("should let you check or uncheck card checkboxes", () => {
      setup({ hasAttachments: true });
      const card1Checkbox = screen.getByLabelText("card1");
      fireEvent.click(card1Checkbox);
      expect(card1Checkbox).not.toBeChecked();
      fireEvent.click(card1Checkbox);
      expect(card1Checkbox).toBeChecked();
    });

    it("should let you check all checkboxes", () => {
      setup({ hasAttachments: true });
      const card2Checkbox = screen.getByLabelText("card2");
      fireEvent.click(card2Checkbox);
      expect(card2Checkbox).toBeChecked();
      expect(screen.getByLabelText("Questions to attach")).toBeChecked();
    });

    it("should let you check/uncheck all boxes via the `Questions to attach` toggle", () => {
      setup({ hasAttachments: true });

      const toggleAllCheckbox = screen.getByLabelText("Questions to attach");
      const card1Checkbox = screen.getByLabelText("card1");
      const card2Checkbox = screen.getByLabelText("card2");

      fireEvent.click(toggleAllCheckbox);

      expect(screen.getByLabelText("Questions to attach")).toBeChecked();
      expect(card1Checkbox).toBeChecked();
      expect(card2Checkbox).toBeChecked();

      fireEvent.click(toggleAllCheckbox);

      expect(screen.getByLabelText("Questions to attach")).not.toBeChecked();
      expect(card1Checkbox).not.toBeChecked();
      expect(card2Checkbox).not.toBeChecked();
    });

    it("should uncheck all boxes if disabling attachments", () => {
      setup({ hasAttachments: true });

      const toggle = screen.getByLabelText("Attach results");
      expect(screen.getByLabelText("card1")).toBeChecked();

      fireEvent.click(toggle);

      expect(screen.queryByText("File format")).not.toBeInTheDocument();
      expect(screen.queryByText("Questions to attach")).not.toBeInTheDocument();
      expect(screen.queryByText("card1")).not.toBeInTheDocument();
      expect(screen.queryByText("card2")).not.toBeInTheDocument();

      fireEvent.click(toggle);
      expect(screen.getByLabelText("card1")).not.toBeChecked();
    });
  });

  describe("when instantiated with duplicate card IDs (visualizer scenario)", () => {
    it("should allow selecting cards independently", () => {
      const pulse = createPulseWithDuplicateCardId();
      const { setPulse } = setup({ pulse });

      // Enable attachments first
      const enableToggle = screen.getByLabelText("Attach results");
      fireEvent.click(enableToggle);

      const originalCardCheckbox = screen.getByLabelText("Original Card");
      const visualizerCardCheckbox = screen.getByLabelText("Visualizer Card");

      // Initially, neither should be checked
      expect(originalCardCheckbox).not.toBeChecked();
      expect(visualizerCardCheckbox).not.toBeChecked();

      // Click the original card
      fireEvent.click(originalCardCheckbox);

      // Assert only original is checked
      expect(originalCardCheckbox).toBeChecked();
      expect(visualizerCardCheckbox).not.toBeChecked();

      // Check setPulse call
      expect(setPulse).toHaveBeenLastCalledWith(
        expect.objectContaining({
          cards: expect.arrayContaining([
            expect.objectContaining({
              id: 10,
              dashboard_card_id: 20,
              include_csv: true, // Default is csv
              include_xls: false,
            }),
            expect.objectContaining({
              id: 10,
              dashboard_card_id: 21,
              include_csv: false,
              include_xls: false,
            }),
          ]),
        }),
      );

      // Click the visualizer card
      fireEvent.click(visualizerCardCheckbox);

      // Assert both are checked now
      expect(originalCardCheckbox).toBeChecked();
      expect(visualizerCardCheckbox).toBeChecked();

      // Check setPulse call again
      expect(setPulse).toHaveBeenLastCalledWith(
        expect.objectContaining({
          cards: expect.arrayContaining([
            expect.objectContaining({
              id: 10,
              dashboard_card_id: 20,
              include_csv: true,
              include_xls: false,
            }),
            expect.objectContaining({
              id: 10,
              dashboard_card_id: 21,
              include_csv: true,
              include_xls: false,
            }),
          ]),
        }),
      );

      // Unclick the original card
      fireEvent.click(originalCardCheckbox);

      // Assert only visualizer is checked
      expect(originalCardCheckbox).not.toBeChecked();
      expect(visualizerCardCheckbox).toBeChecked();

      // Check setPulse call
      expect(setPulse).toHaveBeenLastCalledWith(
        expect.objectContaining({
          cards: expect.arrayContaining([
            expect.objectContaining({
              id: 10,
              dashboard_card_id: 20,
              include_csv: false,
              include_xls: false,
            }),
            expect.objectContaining({
              id: 10,
              dashboard_card_id: 21,
              include_csv: true,
              include_xls: false,
            }),
          ]),
        }),
      );
    });

    it("'Select All' should toggle both cards independently", () => {
      const pulse = createPulseWithDuplicateCardId();
      setup({ pulse });

      // Enable attachments first
      const enableToggle = screen.getByLabelText("Attach results");
      fireEvent.click(enableToggle);

      const toggleAllCheckbox = screen.getByLabelText("Questions to attach");
      const originalCardCheckbox = screen.getByLabelText("Original Card");
      const visualizerCardCheckbox = screen.getByLabelText("Visualizer Card");

      // Click select all
      fireEvent.click(toggleAllCheckbox);
      expect(originalCardCheckbox).toBeChecked();
      expect(visualizerCardCheckbox).toBeChecked();

      // Click select all again (deselect)
      fireEvent.click(toggleAllCheckbox);
      expect(originalCardCheckbox).not.toBeChecked();
      expect(visualizerCardCheckbox).not.toBeChecked();
    });
  });

  describe("PDF attachment", () => {
    it("should render an unchecked 'Attach a PDF' switch by default", () => {
      setup();
      const pdfSwitch = screen.getByRole("switch", {
        name: /Attach a PDF of the dashboard/,
      });
      expect(pdfSwitch).toBeInTheDocument();
      expect(pdfSwitch).not.toBeChecked();
    });

    it("should disable the PDF switch when downloads are not allowed", () => {
      setup({ allowDownload: false });
      expect(
        screen.getByRole("switch", { name: /Attach a PDF of the dashboard/ }),
      ).toBeDisabled();
    });

    it("should render the PDF switch checked when include_pdf is set", () => {
      setup({ includePdf: true });
      expect(
        screen.getByRole("switch", { name: /Attach a PDF of the dashboard/ }),
      ).toBeChecked();
    });

    it("should write include_pdf to every channel when the PDF switch is toggled on", () => {
      const { setPulse } = setup();
      fireEvent.click(
        screen.getByRole("switch", { name: /Attach a PDF of the dashboard/ }),
      );
      expect(setPulse).toHaveBeenLastCalledWith(
        expect.objectContaining({
          channels: expect.arrayContaining([
            expect.objectContaining({
              details: expect.objectContaining({ include_pdf: true }),
            }),
          ]),
        }),
      );
    });
  });

  describe("send only attachments toggle", () => {
    const SEND_ONLY = "Send only attachments";

    it("should be hidden when nothing is attached", () => {
      setup();
      expect(
        screen.queryByRole("switch", { name: SEND_ONLY }),
      ).not.toBeInTheDocument();
    });

    it("should appear when only a PDF is attached", () => {
      setup({ includePdf: true });
      expect(
        screen.getByRole("switch", { name: SEND_ONLY }),
      ).toBeInTheDocument();
    });

    it("should appear when only file attachments are enabled", () => {
      setup({ hasAttachments: true });
      expect(
        screen.getByRole("switch", { name: SEND_ONLY }),
      ).toBeInTheDocument();
    });

    it("should reflect the persisted attachment_only value", () => {
      setup({ includePdf: true, attachmentOnly: true });
      expect(screen.getByRole("switch", { name: SEND_ONLY })).toBeChecked();
    });

    it("should write attachment_only when toggled on with only a PDF attached", () => {
      const { setPulse } = setup({ includePdf: true });
      fireEvent.click(screen.getByRole("switch", { name: SEND_ONLY }));
      expect(setPulse).toHaveBeenLastCalledWith(
        expect.objectContaining({
          channels: expect.arrayContaining([
            expect.objectContaining({
              details: expect.objectContaining({
                include_pdf: true,
                attachment_only: true,
              }),
            }),
          ]),
        }),
      );
    });

    it("should keep attachment_only when files are disabled but a PDF is still attached", () => {
      const { setPulse } = setup({
        hasAttachments: true,
        includePdf: true,
        attachmentOnly: true,
      });

      fireEvent.click(screen.getByLabelText("Attach results"));

      const lastPulse = setPulse.mock.lastCall?.[0];
      expect(lastPulse.channels[0].details.attachment_only).toBe(true);
      expect(lastPulse.channels[0].details.include_pdf).toBe(true);
      expect(
        lastPulse.cards.every(
          (card: { include_csv: boolean; include_xls: boolean }) =>
            !card.include_csv && !card.include_xls,
        ),
      ).toBe(true);
    });

    it("should clear attachment_only when the PDF is disabled and no files are attached", () => {
      const { setPulse } = setup({ includePdf: true, attachmentOnly: true });

      fireEvent.click(
        screen.getByRole("switch", { name: /Attach a PDF of the dashboard/ }),
      );

      const lastPulse = setPulse.mock.lastCall?.[0];
      expect(lastPulse.channels[0].details.include_pdf).toBe(false);
      expect(lastPulse.channels[0].details.attachment_only).toBe(false);
    });
  });
});

function createPulse(): DashboardSubscription {
  return {
    name: "Parameters",
    cards: [
      {
        id: 4,
        collection_id: null,
        description: null,
        display: "map",
        name: "card1",
        include_csv: false,
        include_xls: false,
        dashboard_card_id: 3,
        dashboard_id: 1,
        parameter_mappings: [],
      },
      {
        id: 6,
        collection_id: null,
        description: null,
        display: "scalar",
        name: "card2",
        include_csv: false,
        include_xls: false,
        dashboard_card_id: 4,
        dashboard_id: 1,
        parameter_mappings: [],
      },
    ],
    channels: [
      {
        channel_type: "email",
        enabled: true,
        recipients: [],
        details: {},
        schedule_type: "hourly",
        schedule_day: "mon",
        schedule_hour: 8,
        schedule_frame: "first",
      },
      {
        channel_type: "email",
        enabled: true,
        recipients: [],
        details: {},
        schedule_type: "hourly",
        schedule_day: "mon",
        schedule_hour: 8,
        schedule_frame: "first",
      },
    ],
    skip_if_empty: false,
    collection_id: null,
    parameters: [],
    dashboard_id: 1,
    archived: false,
    can_write: true,
    collection_position: null,
    created_at: "2024-01-01T00:00:00Z",
    // Unjustified type cast. FIXME
    creator: { id: 1, common_name: "Test", email: "test@test.com" } as any,
    creator_id: 1,
    disable_links: false,
    // Unjustified type cast. FIXME
    entity_id: "test-entity-id" as any,
    id: 1,
    updated_at: "2024-01-01T00:00:00Z",
  };
}

function createPulseWithDuplicateCardId(): DashboardSubscription {
  return {
    name: "Duplicate Card ID Pulse",
    cards: [
      {
        id: 10,
        collection_id: null,
        description: null,
        display: "table",
        name: "Original Card",
        include_csv: false,
        include_xls: false,
        dashboard_card_id: 20,
        dashboard_id: 2,
        parameter_mappings: [],
      },
      {
        id: 10, // Same card ID as above
        collection_id: null,
        description: null,
        display: "line",
        name: "Visualizer Card",
        include_csv: false,
        include_xls: false,
        dashboard_card_id: 21, // Different dashboard_card_id
        dashboard_id: 2,
        parameter_mappings: [],
      },
    ],
    channels: [
      {
        channel_type: "email",
        enabled: true,
        recipients: [],
        details: {},
        schedule_type: "hourly",
      },
    ],
    skip_if_empty: false,
    collection_id: null,
    parameters: [],
    dashboard_id: 2,
    archived: false,
    can_write: true,
    collection_position: null,
    created_at: "2024-01-01T00:00:00Z",
    // Unjustified type cast. FIXME
    creator: { id: 1, common_name: "Test", email: "test@test.com" } as any,
    creator_id: 1,
    disable_links: false,
    // Unjustified type cast. FIXME
    entity_id: "test-entity-id" as any,
    id: 2,
    updated_at: "2024-01-01T00:00:00Z",
  };
}
