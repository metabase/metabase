import userEvent from "@testing-library/user-event";
import { useState } from "react";

import {
  setupAdhocQueryMetadataEndpoint,
  setupCardEndpoints,
  setupCardQueryMetadataEndpoint,
  setupTableQueryMetadataEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { DataAttributeMap } from "metabase-enterprise/sandboxes/types";
import type { DimensionRef, GroupTableAccessPolicy } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockTable,
} from "metabase-types/api/mocks";

import { DataAttributeMappingEditor } from "./DataAttributeMappingEditor";

const tablePolicy: GroupTableAccessPolicy = {
  id: 1,
  permission_id: 1,
  table_id: 1,
  group_id: 3,
  card_id: null,
  attribute_remappings: {
    color: ["dimension", ["field", 11]],
  },
};

const cardPolicy: GroupTableAccessPolicy = {
  id: 2,
  permission_id: 2,
  table_id: 0,
  group_id: 3,
  card_id: 2,
  attribute_remappings: {
    color: ["dimension", ["field", 22]],
  },
};
const policyTable = createMockTable();

const options = ["type", "color", "personal", "other"];

type MappingType = DataAttributeMap<DimensionRef | string | null>;

const Wrapper = ({
  spy,
  shouldUseSavedQuestion,
}: {
  spy: (value: MappingType) => void;
  shouldUseSavedQuestion: boolean;
}) => {
  const policy = shouldUseSavedQuestion ? cardPolicy : tablePolicy;
  const [value, setValue] = useState<MappingType>(policy.attribute_remappings);

  const handleChange = (newValue: MappingType) => {
    setValue(newValue);
    spy(newValue);
  };

  const valueAttrs = Object.keys(value);

  return (
    <DataAttributeMappingEditor
      value={value}
      policyTable={policyTable}
      onChange={handleChange}
      shouldUseSavedQuestion={shouldUseSavedQuestion}
      policy={policy}
      attributesOptions={options.filter(
        (option) => !valueAttrs.includes(option),
      )}
    />
  );
};

const setup = async ({
  shouldUseSavedQuestion,
}: {
  shouldUseSavedQuestion: boolean;
}) => {
  const card = createMockCard({ id: cardPolicy.card_id as number });
  const cardQueryMetadata = createMockCardQueryMetadata({});
  setupTableQueryMetadataEndpoint(createMockTable());
  setupCardQueryMetadataEndpoint(card, cardQueryMetadata);
  setupAdhocQueryMetadataEndpoint(cardQueryMetadata);
  setupCardEndpoints(card);

  const onChange = jest.fn();

  renderWithProviders(
    <Wrapper spy={onChange} shouldUseSavedQuestion={shouldUseSavedQuestion} />,
  );

  expect(await screen.findByTestId("mapping-editor")).toBeInTheDocument();

  return { onChange };
};

describe("DataAttributeMappingEditor", () => {
  describe("table mode", () => {
    it("should render table mode correctly", async () => {
      await setup({ shouldUseSavedQuestion: false });

      expect(screen.getByText("Column")).toBeInTheDocument();
      expect(screen.getByText("User attribute")).toBeInTheDocument();
    });

    it("should allow changing a user attribute", async () => {
      const { onChange } = await setup({ shouldUseSavedQuestion: false });

      const select = screen.getByPlaceholderText("Pick a user attribute");
      expect(select).toBeInTheDocument();

      await userEvent.click(select);
      await userEvent.click(await screen.findByText("other"));

      expect(onChange).toHaveBeenCalledWith({
        other: ["dimension", ["field", 11]],
      });
    });
  });

  describe("question mode", () => {
    it("should render question mode correctly", async () => {
      await setup({ shouldUseSavedQuestion: true });

      expect(screen.getByText("Parameter or variable")).toBeInTheDocument();
      expect(screen.getByText("User attribute")).toBeInTheDocument();
    });

    it("should allow changing a user attribute", async () => {
      const { onChange } = await setup({ shouldUseSavedQuestion: true });

      const select = screen.getByPlaceholderText("Pick a user attribute");
      expect(select).toBeInTheDocument();

      await userEvent.click(select);
      await userEvent.click(await screen.findByText("other"));

      expect(onChange).toHaveBeenCalledWith({
        other: ["dimension", ["field", 22]],
      });
    });
  });
});
