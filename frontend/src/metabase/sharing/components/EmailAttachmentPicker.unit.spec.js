import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";

import EmailAttachmentPicker from "./EmailAttachmentPicker";

describe("EmailAttachmentPicker", () => {
  describe("when instantiated without any cards with attachments", () => {
    let pulse;
    let setPulse;
    beforeEach(() => {
      pulse = createPulse();
      setPulse = jest.fn();
      render(
        <EmailAttachmentPicker
          cards={pulse.cards}
          pulse={pulse}
          setPulse={setPulse}
        />,
      );
    });

    it("should have a Toggle that is not toggled", () => {
      const toggle = screen.getByRole("checkbox");
      expect(toggle).toBeInTheDocument();
      expect(toggle.dataset.testid).toEqual("toggle");
      expect(toggle.getAttribute("aria-checked")).toBe("false");
    });

    it("should have a clickable toggle that reveals attachment type and a checkbox per question", () => {
      expect(screen.queryByText("File format")).toBeNull();
      expect(screen.queryByText("Questions to attach")).toBeNull();
      expect(screen.queryByText("card1")).toBeNull();
      expect(screen.queryByText("card2")).toBeNull();

      const toggle = screen.getByRole("checkbox");
      fireEvent.click(toggle);

      const csvFormatInput = screen.getByLabelText(".csv");
      expect(csvFormatInput.checked).toBe(true);

      const toggleAllCheckbox = screen.getByLabelText("Questions to attach");
      expect(toggleAllCheckbox.checked).toBe(false);

      const card1Checkbox = screen.getByLabelText("card1");
      expect(card1Checkbox.checked).toBe(false);

      const card2Checkbox = screen.getByLabelText("card2");
      expect(card2Checkbox.checked).toBe(false);
    });
  });

  describe("when instantiated with cards with attachments", () => {
    let pulse;
    let setPulse;
    beforeEach(() => {
      pulse = createPulse();
      pulse.cards[0]["include_xls"] = true;
      setPulse = jest.fn();
      render(
        <EmailAttachmentPicker
          cards={pulse.cards}
          pulse={pulse}
          setPulse={setPulse}
        />,
      );
    });

    it("should have a toggled Toggle", () => {
      const toggle = screen.getByTestId("toggle");
      expect(toggle).toBeInTheDocument();
      expect(toggle.getAttribute("aria-checked")).toBe("true");
    });

    it("should have selected the xlsv format", () => {
      const csvFormatInput = screen.getByLabelText(".csv");
      expect(csvFormatInput.checked).toBe(false);
      const xlsxFormatInput = screen.getByLabelText(".xlsx");
      expect(xlsxFormatInput.checked).toBe(true);
    });

    it("should show a checked checkbox for the card with an attachment", () => {
      const toggleAllCheckbox = screen.getByLabelText("Questions to attach");
      expect(toggleAllCheckbox.checked).toBe(false);

      const card1Checkbox = screen.getByLabelText("card1");
      expect(card1Checkbox.checked).toBe(true);

      const card2Checkbox = screen.getByLabelText("card2");
      expect(card2Checkbox.checked).toBe(false);
    });

    it("should let you check or uncheck card checkboxes", () => {
      const card1Checkbox = screen.getByLabelText("card1");
      fireEvent.click(card1Checkbox);
      expect(card1Checkbox.checked).toBe(false);
      fireEvent.click(card1Checkbox);
      expect(card1Checkbox.checked).toBe(true);
    });

    it("should let you check all checkboxes", () => {
      const card2Checkbox = screen.getByLabelText("card2");
      fireEvent.click(card2Checkbox);
      expect(card2Checkbox.checked).toBe(true);
      expect(screen.getByLabelText("Questions to attach").checked).toBe(true);
    });

    it("should let you check/uncheck all boxes via the `Questions to attach` toggle", () => {
      const toggleAllCheckbox = screen.getByLabelText("Questions to attach");
      const card1Checkbox = screen.getByLabelText("card1");
      const card2Checkbox = screen.getByLabelText("card2");

      fireEvent.click(toggleAllCheckbox);

      expect(screen.getByLabelText("Questions to attach").checked).toBe(true);
      expect(card1Checkbox.checked).toBe(true);
      expect(card2Checkbox.checked).toBe(true);

      fireEvent.click(toggleAllCheckbox);

      expect(screen.getByLabelText("Questions to attach").checked).toBe(false);
      expect(card1Checkbox.checked).toBe(false);
      expect(card2Checkbox.checked).toBe(false);
    });

    it("should uncheck all boxes if disabling attachments", () => {
      const toggle = screen.getByTestId("toggle");
      expect(screen.getByLabelText("card1").checked).toBe(true);

      fireEvent.click(toggle);

      expect(screen.queryByText("File format")).toBeNull();
      expect(screen.queryByText("Questions to attach")).toBeNull();
      expect(screen.queryByText("card1")).toBeNull();
      expect(screen.queryByText("card2")).toBeNull();

      fireEvent.click(toggle);
      expect(screen.getByLabelText("card1").checked).toBe(false);
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
