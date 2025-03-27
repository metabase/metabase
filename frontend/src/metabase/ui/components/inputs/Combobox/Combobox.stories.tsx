import { useEffect, useState } from "react";

import {
  Button,
  Center,
  Combobox,
  Stack,
  Text,
  useCombobox,
} from "metabase/ui";

const groceries = [
  "🍎 Apples",
  "🍌 Bananas",
  "🥦 Broccoli",
  "🥕 Carrots",
  "🍫 Chocolate",
  "🍇 Grapes",
];

const args = {
  minWidth: 0,
  data: groceries,
  size: "md",
  asyncDataFetch: false,
  searchable: false,
};

const argTypes = {
  data: {
    control: { type: "json" },
  },
  size: {
    options: ["xs", "sm", "md", "lg", "xl"],
    control: { type: "inline-radio" },
  },
  asyncDataFetch: {
    control: { type: "boolean" },
  },
  minWidth: {
    control: { type: "number" },
  },
  searchable: {
    control: { type: "boolean" },
  },
};

type StorybookProps = typeof args;

function ComboboxTemplate(props: StorybookProps) {
  const combobox = useCombobox({
    defaultOpened: true,
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const [value, setValue] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [data] = useState<string[]>(props.data);
  const [loading, setLoading] = useState(props.asyncDataFetch);

  // Emulate loading
  useEffect(() => {
    if (props.asyncDataFetch) {
      setLoading(true);
      setTimeout(() => {
        setLoading(false);
      }, 1000);
    }
  }, [props.asyncDataFetch]);

  const options = data
    .filter(item => item.toLowerCase().includes(search.toLowerCase().trim()))
    .map(item => (
      <Combobox.Option value={item} key={item} selected={item === value}>
        {item}
      </Combobox.Option>
    ));

  return (
    <Combobox
      size={props.size}
      store={combobox}
      withinPortal={false}
      onOptionSubmit={val => {
        setValue(val);
        combobox.closeDropdown();
      }}
    >
      <Center>
        <Stack gap="xs">
          <Text>
            Selected: <strong>{value ?? "Nothing"}</strong>
          </Text>

          <Combobox.Target>
            <Button onClick={() => combobox.toggleDropdown()}>
              Toggle Combobox
            </Button>
          </Combobox.Target>
        </Stack>
      </Center>

      <Combobox.Dropdown miw={props.minWidth || undefined} p="2px">
        {props.searchable && (
          <Combobox.Search
            value={search}
            placeholder="Search..."
            onChange={event => setSearch(event.target.value)}
          />
        )}
        <Combobox.Options>
          {loading ? (
            <Combobox.Empty>Loading...</Combobox.Empty>
          ) : options.length > 0 ? (
            options
          ) : (
            <Combobox.Empty>No results found</Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}

export default {
  title: "Components/Ask Before Using/Combobox",
  component: Combobox,
  args: {
    size: "md",
    children: "Text",
  },
  argTypes,
};

export const Default = {
  render: ComboboxTemplate,
  args: {
    size: "md",
  },
};

export const MinWidth = {
  render: ComboboxTemplate,
  args: {
    minWidth: 300,
  },
};

export const AsyncDataFetch = {
  render: ComboboxTemplate,
  args: {
    size: "md",
    asyncDataFetch: true,
  },
};

export const AsyncSearchable = {
  render: ComboboxTemplate,
  args: {
    size: "md",
    minWidth: 300,
    asyncDataFetch: true,
    searchable: true,
    creatable: true,
  },
};
