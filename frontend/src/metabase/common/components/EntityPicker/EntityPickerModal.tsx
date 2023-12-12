import { useState, useCallback } from "react";
import { t } from "ttag";
import { useDebouncedEffect } from "metabase/hooks/use-debounced-effect";
import { Tabs, Modal, Button, Flex, Box, TextInput } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import ErrorBoundary from "metabase/ErrorBoundary";
import { color } from "metabase/lib/colors";
import Search from "metabase/entities/search";
import { QuestionPicker } from "./SpecificEntityPickers/QuestionPicker";
import { TablePicker } from "./SpecificEntityPickers/TablePicker";
import { CollectionPicker } from "./SpecificEntityPickers/CollectionPicker";
import { EntityPickerSearchResults, EntityPickerSearchTab } from "./EntityPickerSearch";

const tabOptions = {
  question: {
    label: t`Questions`,
    component: QuestionPicker,
  },
  table: {
    label: t`Tables`,
    component: TablePicker,
  },
  collection: {
    label: t`Collections`,
    component: CollectionPicker,
  },
};

type ValidTab = keyof typeof tabOptions;

type EntityPickerModalOptions = {
  showPersonalCollection?: boolean;
  showSearch?: boolean;
  showRecents?: boolean;
  hasConfirmButtons?: boolean;
};

const defaultOptions: EntityPickerModalOptions = {
  showPersonalCollection: true,
  showSearch: true,
  showRecents: true,
  hasConfirmButtons: true,
};

interface EntityPickerModalProps {
  title: string;
  value?: any;
  onChange: (item: any) => void;
  onClose: () => void;
  tabs: ValidTab[];
  options?: EntityPickerModalOptions;
}

export function EntityPickerModal({
  title = t`Choose an item`,
  onChange,
  onClose,
  tabs,
  value,
  options = defaultOptions,
}: EntityPickerModalProps) {
  const validTabs = tabs.filter(tabName => tabName in tabOptions);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);

  const handleItemSelect = useCallback(
    (item: any) => {
      if (options.hasConfirmButtons) {
        setSelectedItem(item);
      } else {
        onChange(item);
      }
    },
    [onChange, options],
  );

  const handleConfirm = () => {
    onChange(selectedItem);
  };

  useDebouncedEffect(() => {
    if (searchQuery) {
      Search.api.list({ models: tabs, q: searchQuery }).then((results: any) => {
        if (results.data) {
          setSearchResults(results.data);
        }
      });

    }

    if (!searchQuery) {
      setSearchResults(null);
    }
  }, 200, [searchQuery, tabs]);

  const hasTabs = validTabs.length > 1 || searchQuery;

  return (
    <Modal.Root opened onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content
        style={{
          height: "100%",
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Modal.Header px="2rem" pt="1rem" pb={hasTabs ? "1rem" : "1.5rem"}>
          <Flex justify="space-between" style={{ flexGrow: 1 }}>
            <Modal.Title lh="2.5rem">{title}</Modal.Title>
            {options.showSearch && (
              <TextInput
                type="search"
                icon={<Icon name="search" size={16} />}
                miw={400}
                mr="lg"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t`Search…`}
              />
            )}
          </Flex>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body
          p="0"
          style={{
            flex: "1 1 auto",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <ErrorBoundary>
            {hasTabs ? (
              <TabsView
                tabs={validTabs}
                onItemSelect={handleItemSelect}
                value={value}
                searchQuery={searchQuery}
                searchResults={searchResults}
                options={options}
                selectedItem={selectedItem}
              />
            ) : (
              <SinglePickerView
                model={tabs[0]}
                onItemSelect={handleItemSelect}
                value={value}
                options={options}
              />
            )}
            {!!options.hasConfirmButtons && (
              <ButtonBar
                onConfirm={handleConfirm}
                onCancel={onClose}
                canConfirm={!!selectedItem}
              />
            )}
          </ErrorBoundary>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

export const SinglePickerView = ({
  model,
  onItemSelect,
  value,
  options,
}: {
  model: ValidTab;
  onItemSelect: (item: any) => void;
  value?: any;
  options: EntityPickerModalOptions;
}) => {
  const { component: PickerComponent } = tabOptions[model];

  return (
    <Box
      style={{
        borderTop: `1px solid ${color("border")}`,
        flexGrow: 1,
        height: 0,
      }}
    >
      <PickerComponent
        onItemSelect={onItemSelect}
        value={value}
        options={options}
      />
    </Box>
  );
};

export const TabsView = ({
  tabs,
  onItemSelect,
  value,
  options,
  searchQuery,
  searchResults,
  selectedItem,
}: {
  tabs: ValidTab[];
  onItemSelect: (item: any) => void;
  value?: any;
  options: EntityPickerModalOptions;
  searchQuery: string;
  searchResults: any[] | null;
  selectedItem: any;
}) => {
  const hasSearchTab = !!searchQuery;
  const defaultTab = hasSearchTab ? "search" : tabs[0];

  return (
    <Tabs
      defaultValue={defaultTab}
      style={{
        flexGrow: 1,
        height: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Tabs.List px="md">
        {tabs.map(tabName => {
          const { label } = tabOptions[tabName];

          return (
            <Tabs.Tab key={tabName} value={tabName} icon={<Icon name={tabName} />}>
              {label}
            </Tabs.Tab>
          );
        })}
        {hasSearchTab && (
          <EntityPickerSearchTab
            searchResults={searchResults}
            searchQuery={searchQuery}
          />
        )}
      </Tabs.List>

      {tabs.map(tabName => {
        const { component: TabComponent } = tabOptions[tabName];

        return (
          <Tabs.Panel key={tabName} value={tabName}
            style={{
              flexGrow: 1,
              height: 0,
            }}
          >
            <TabComponent
              onItemSelect={onItemSelect}
              value={value}
              options={options}
            />
          </Tabs.Panel>
        );
      })}
      {hasSearchTab && (
        <Tabs.Panel
          key="search"
          value="search"
          style={{
            flexGrow: 1,
            height: 0,
          }}
        >
          <EntityPickerSearchResults
            searchResults={searchResults}
            onItemSelect={onItemSelect}
            selectedItem={selectedItem}
          />
        </Tabs.Panel>
      )}
    </Tabs>
  );

};

export const ButtonBar = ({
  onConfirm,
  onCancel,
  canConfirm,
}: {
  onConfirm: (item: any) => void;
  onCancel: () => void;
  canConfirm?: boolean;
}) => (
  <Flex
    justify="space-between"
    p="md"
    style={{
      borderTop: `1px solid ${color("border")}`,
    }}
  >
    <Flex gap="md"></Flex>
    <Flex gap="md">
      <Button onClick={onCancel}>{t`Cancel`}</Button>
      <Button
        ml={1}
        variant="filled"
        onClick={onConfirm}
        disabled={!canConfirm}
      >
        {t`Select`}
      </Button>
    </Flex>
  </Flex>
);
