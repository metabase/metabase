import { useState, useCallback } from "react";
import { t } from "ttag";
import { Tabs, Modal, Button, Flex, Box } from "metabase/ui";

import ErrorBoundary from "metabase/ErrorBoundary";
import { color } from "metabase/lib/colors";
import { QuestionPicker } from "./SpecificEntityPickers/QuestionPicker";
import { TablePicker } from "./SpecificEntityPickers/TablePicker";
import { CollectionPicker } from "./SpecificEntityPickers/CollectionPicker";

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

interface EntityPickerModalProps {
  title: string;
  onChange: (item: any) => void;
  onClose: () => void;
  tabs: ValidTab[];
  hasConfirmButtons?: boolean;
  value?: any;
}

export function EntityPickerModal({
  title = t`Choose an item`,
  onChange,
  onClose,
  tabs,
  hasConfirmButtons = true,
  value,
}: EntityPickerModalProps) {
  const validTabs = tabs.filter(tabName => tabName in tabOptions);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const handleItemSelect = useCallback(
    (item: any) => {
      if (hasConfirmButtons) {
        setSelectedItem(item);
      } else {
        onChange(item);
      }
    },
    [onChange, hasConfirmButtons],
  );

  const handleConfirm = () => {
    onChange(selectedItem);
  };

  const multiTab = validTabs.length > 1;

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
        <Modal.Header px="2rem" pt="1rem" pb={multiTab ? "1rem" : "1.5rem"}>
          <Modal.Title lh="2.5rem">{title}</Modal.Title>
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
            {multiTab ? (
              <TabsView
                tabs={validTabs}
                onItemSelect={handleItemSelect}
                value={value}
              />
            ) : (
              <SinglePickerView
                model={tabs[0]}
                onItemSelect={handleItemSelect}
                value={value}
              />
            )}
            {hasConfirmButtons && (
              <ButtonBar onConfirm={handleConfirm} onCancel={onClose} />
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
}: {
  model: ValidTab;
  onItemSelect: (item: any) => void;
  value?: any;
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
      <PickerComponent onItemSelect={onItemSelect} value={value} />
    </Box>
  );
};

export const TabsView = ({
  tabs,
  onItemSelect,
  value,
}: {
  tabs: ValidTab[];
  onItemSelect: (item: any) => void;
  value?: any;
}) => (
  <Tabs
    defaultValue={tabs[0]}
    style={{
      flexGrow: 1,
      height: 0,
      display: "flex",
      flexDirection: "column",
    }}
  >
    <Tabs.List>
      {tabs.map(tabName => {
        const { label } = tabOptions[tabName];

        return (
          <Tabs.Tab key={tabName} value={tabName} ml="1.5rem">
            {label}
          </Tabs.Tab>
        );
      })}
    </Tabs.List>

    {tabs.map(tabName => {
      const { component: TabComponent } = tabOptions[tabName];

      return (
        <Tabs.Panel
          key={tabName}
          value={tabName}
          style={{
            flexGrow: 1,
            height: 0,
          }}
        >
          <TabComponent onItemSelect={onItemSelect} value={value} />
        </Tabs.Panel>
      );
    })}
  </Tabs>
);

export const ButtonBar = ({
  onConfirm,
  onCancel,
}: {
  onConfirm: (item: any) => void;
  onCancel: () => void;
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
      <Button ml={1} variant="filled" onClick={onConfirm}>{t`Select`}</Button>
    </Flex>
  </Flex>
);
