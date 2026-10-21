import {
  type ComboboxItem,
  type ComboboxItemGroup,
  InputBase,
} from "@mantine/core";
import type { StoryFn } from "@storybook/react";
import { Fragment, type ReactNode } from "react";

import {
  Box,
  Combobox,
  MultiSelect,
  Select,
  TagsInput,
  useCombobox,
} from "metabase/ui";
import {
  StoryJsx,
  StoryLabel,
  StoryShowcase,
} from "metabase/ui/stories/showcase";

export default {
  title: "Components/Inputs/Combobox",
};

// TagsInput shows the value in its pill, so the selected value reads like its label
const SELECTED = "Selected";

const STATE_OPTIONS: ComboboxItem[] = [
  { value: "first", label: "Label" },
  { value: "hover", label: "Hover" },
  { value: "third", label: "Label" },
  { value: SELECTED, label: SELECTED },
  { value: "fifth", label: "Label" },
  { value: "disabled", label: "Disabled", disabled: true },
];

const GROUP_OPTIONS: ComboboxItemGroup<ComboboxItem>[] = [
  {
    group: "Group label",
    items: [
      { value: "one", label: "Label" },
      { value: "two", label: "Label" },
    ],
  },
  {
    group: "Another group",
    items: [
      { value: "three", label: "Label" },
      { value: "four", label: "Label" },
    ],
  },
];

const EMPTY_SEARCH = "Value";
const EMPTY_MESSAGE = "No results";

// Rendered inline (no portal) and pinned below the input, so every dropdown
// stays open in its own cell and the story can be snapshotted.
const COMBOBOX_PROPS = {
  withinPortal: false,
  position: "bottom-start",
  middlewares: { flip: false, shift: false },
} as const;

// Each row is tall enough for its open dropdown below the input
const ROWS = [
  { id: "states", label: "Option states", height: "17.5rem" },
  { id: "groups", label: "Group labels", height: "17.5rem" },
  { id: "empty", label: "Empty", height: "11rem" },
] as const;

type RowId = (typeof ROWS)[number]["id"];

const SelectCell = ({ row }: { row: RowId }) => {
  if (row === "states") {
    return (
      <Select
        data={STATE_OPTIONS}
        value={SELECTED}
        dropdownOpened
        comboboxProps={COMBOBOX_PROPS}
      />
    );
  }
  if (row === "groups") {
    return (
      <Select
        data={GROUP_OPTIONS}
        placeholder="Placeholder"
        dropdownOpened
        comboboxProps={COMBOBOX_PROPS}
      />
    );
  }
  return (
    <Select
      data={STATE_OPTIONS}
      searchable
      searchValue={EMPTY_SEARCH}
      nothingFoundMessage={EMPTY_MESSAGE}
      dropdownOpened
      comboboxProps={COMBOBOX_PROPS}
    />
  );
};

const MultiSelectCell = ({ row }: { row: RowId }) => {
  if (row === "states") {
    return (
      <MultiSelect
        data={STATE_OPTIONS}
        value={[SELECTED]}
        dropdownOpened
        comboboxProps={COMBOBOX_PROPS}
      />
    );
  }
  if (row === "groups") {
    return (
      <MultiSelect
        data={GROUP_OPTIONS}
        placeholder="Placeholder"
        dropdownOpened
        comboboxProps={COMBOBOX_PROPS}
      />
    );
  }
  return (
    <MultiSelect
      data={STATE_OPTIONS}
      searchable
      searchValue={EMPTY_SEARCH}
      nothingFoundMessage={EMPTY_MESSAGE}
      dropdownOpened
      comboboxProps={COMBOBOX_PROPS}
    />
  );
};

const ComboboxOptions = ({ items }: { items: ComboboxItem[] }) =>
  items.map((item) => (
    <Combobox.Option
      key={item.value}
      value={item.value}
      disabled={item.disabled}
      active={item.value === SELECTED}
    >
      {item.label}
    </Combobox.Option>
  ));

// A raw Combobox, as used directly in the app. Autocomplete and
// MultiAutocomplete render the same Combobox styles.
const ComboboxCell = ({ row }: { row: RowId }) => {
  const combobox = useCombobox({ opened: true });

  return (
    <Combobox store={combobox} {...COMBOBOX_PROPS}>
      <Combobox.Target>
        <InputBase
          readOnly
          placeholder="Placeholder"
          value={row === "empty" ? EMPTY_SEARCH : ""}
        />
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options>
          {row === "states" && <ComboboxOptions items={STATE_OPTIONS} />}
          {row === "groups" &&
            GROUP_OPTIONS.map(({ group, items }) => (
              <Combobox.Group key={group} label={group}>
                <ComboboxOptions items={items} />
              </Combobox.Group>
            ))}
          {row === "empty" && <Combobox.Empty>{EMPTY_MESSAGE}</Combobox.Empty>}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
};

const TagsInputCell = ({ row }: { row: RowId }) => {
  if (row === "empty") {
    // TagsInput has no empty message
    return <StoryLabel>n/a</StoryLabel>;
  }
  return (
    <TagsInput
      data={row === "states" ? STATE_OPTIONS : GROUP_OPTIONS}
      value={row === "states" ? [SELECTED] : undefined}
      placeholder="Placeholder"
      dropdownOpened
      comboboxProps={COMBOBOX_PROPS}
    />
  );
};

const COLUMNS: {
  jsx: string;
  Cell: (props: { row: RowId }) => ReactNode;
}[] = [
  { jsx: "<Select />", Cell: SelectCell },
  { jsx: "<MultiSelect />", Cell: MultiSelectCell },
  { jsx: "<Combobox />", Cell: ComboboxCell },
  { jsx: "<TagsInput />", Cell: TagsInputCell },
];

const CELL_WIDTH = "16rem";

const DropdownTemplate: StoryFn = () => (
  <StoryShowcase title="Combobox dropdown">
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: `8rem repeat(${COLUMNS.length}, ${CELL_WIDTH})`,
        columnGap: "2rem",
        rowGap: "1.5rem",
        alignItems: "start",
      }}
    >
      <div />
      {COLUMNS.map(({ jsx }) => (
        <StoryJsx key={jsx}>{jsx}</StoryJsx>
      ))}
      {ROWS.map((row) => (
        <Fragment key={row.id}>
          <StoryLabel>{row.label}</StoryLabel>
          {COLUMNS.map(({ jsx, Cell }) => (
            <Box
              key={jsx}
              data-dropdown-row={row.id}
              pos="relative"
              h={row.height}
            >
              <Cell row={row.id} />
            </Box>
          ))}
        </Fragment>
      ))}
    </Box>
  </StoryShowcase>
);

// The second option of the "Option states" dropdowns shows the hover state
const hoverSelector = `[data-dropdown-row="states"] [data-combobox-option]:nth-child(2)`;

export const Dropdown = {
  render: DropdownTemplate,
  parameters: {
    pseudo: { hover: [hoverSelector] },
    controls: { include: ["theme"] },
  },
};
