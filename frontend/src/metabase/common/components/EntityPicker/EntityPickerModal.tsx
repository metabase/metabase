import { useState, useCallback } from "react";
import { t } from "ttag";
import { Tabs, Modal, Button, Flex } from "metabase/ui";

import ErrorBoundary from "metabase/ErrorBoundary";
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

type ValidTab = (keyof typeof tabOptions);

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

  const handleItemSelect = useCallback((item: any) => {
    if (hasConfirmButtons) {
      setSelectedItem(item);
    } else {
      onChange(item);
    }
  }, [onChange, hasConfirmButtons]);

  const handleConfirm = () => {
    onChange(selectedItem);
  };

  return (
    <Modal title={title} opened onClose={onClose} size="100%" h="800px">
      <ErrorBoundary>
        {validTabs.length > 1 ? (
          <TabsView tabs={validTabs} onItemSelect={handleItemSelect} value={value} />
        ) : (
          <SinglePickerView model={tabs[0]} onItemSelect={handleItemSelect} value={value} />
        )}
        {hasConfirmButtons && (
          <ButtonBar
            onConfirm={handleConfirm}
            onCancel={onClose}
          />
        )}
      </ErrorBoundary>
    </Modal>
  );
}

export const SinglePickerView = ({
  model, onItemSelect, value,
}: {
  model: ValidTab,
  onItemSelect: (item: any) => void,
  value?: any
}) => {
  const { component: PickerComponent } = tabOptions[model];

  return (
    <PickerComponent onItemSelect={onItemSelect} value={value} />
  );
};

export const TabsView = ({
  tabs, onItemSelect, value,
}: {
  tabs: ValidTab[];
  onItemSelect: (item: any) => void;
  value?: any;
}) => (
  <Tabs defaultValue={tabs[0]}>
    <Tabs.List>
      {tabs.map(tabName => {
        const { label } = tabOptions[tabName];

        return (<Tabs.Tab key={tabName} value={tabName}>{label}</Tabs.Tab>);
      })}
    </Tabs.List>

    {tabs.map(tabName => {
      const { component: TabComponent } = tabOptions[tabName];

      return (
        <Tabs.Panel key={tabName} value={tabName}>
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
  <Flex justify="space-between" pt="md">
    <Flex gap="md">

    </Flex>
    <Flex gap="md">
      <Button onClick={onCancel}>{t`Cancel`}</Button>
      <Button ml={1} variant="filled" onClick={onConfirm}>{t`Select`}</Button>
    </Flex>
  </Flex>
);
