import { useState } from "react";
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
  onItemSelect: (item: any) => void;
  onClose: () => void;
  tabs: ValidTab[];
  hasConfirmButtons?: boolean;
}

export function EntityPickerModal({
  title = t`Choose an item`,
  onItemSelect,
  onClose,
  tabs,
  hasConfirmButtons = true,
}: EntityPickerModalProps) {
  const validTabs = tabs.filter(tabName => tabName in tabOptions);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const handleItemSelect = (item: any) => {
    if (hasConfirmButtons) {
      setSelectedItem(item);
    } else {
      onItemSelect(item);
    }
  };

  const handleConfirm = () => {
    onItemSelect(selectedItem);
  };

  return (
    <Modal title={title} opened onClose={onClose} size="auto">
      <ErrorBoundary>
        {validTabs.length > 1 ? (
          <TabsView tabs={validTabs} onItemSelect={handleItemSelect} />
        ) : (
          <SinglePickerView model={tabs[0]} onItemSelect={handleItemSelect} />
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
  model, onItemSelect,
}: {
  model: ValidTab,
  onItemSelect: (item: any) => void,
}) => {
  const { component: PickerComponent } = tabOptions[model];

  return (
    <PickerComponent onItemSelect={onItemSelect} />
  );
};

export const TabsView = ({ tabs, onItemSelect }: { tabs: ValidTab[], onItemSelect: (item: any) => void; }) => (
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
          <TabComponent onItemSelect={onItemSelect} />
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
  <Flex justify="space-between">
    <Flex gap="md">

    </Flex>
    <Flex gap="md">
      <Button onClick={onCancel}>{t`Cancel`}</Button>
      <Button ml={1} variant="filled" onClick={onConfirm}>{t`Select`}</Button>
    </Flex>
  </Flex>
);
