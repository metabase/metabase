import { render, fireEvent, screen } from "@testing-library/react";

import EmailAttachmentPicker from "./EmailAttachmentPicker";

function setup({ pulse = createPulse(), hasAttachments = false } = {}) {
  const setPulse = jest.fn();

  if (hasAttachments) {
    pulse.cards[0]["include_xls"] = true;
  }

  render(
    <EmailAttachmentPicker
      cards={pulse.cards}
      pulse={pulse}
      setPulse={setPulse}
    />,
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
});

function createPulse() {
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
  };
}
