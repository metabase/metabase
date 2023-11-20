import { Tabs, Modal } from "metabase/ui";

import { QuestionPicker } from "./QuestionPicker";
import { TablePicker } from "./TablePicker";

interface TabbedEntityPickerProps {
  onItemSelect: (item: any) => void;
  tabs: string[];
}

export function TabbedEntityPicker({
  onItemSelect,
  tabs,
}: TabbedEntityPickerProps) {
  return (
    <Modal title="Entity Picker" opened onClose={() => null} size="auto">
      <Tabs defaultValue="question">
        <Tabs.List>
          <Tabs.Tab value="question">Questions</Tabs.Tab>
          <Tabs.Tab value="table">Tables</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="question">
          <QuestionPicker onItemSelect={onItemSelect} />
        </Tabs.Panel>

        <Tabs.Panel value="table">
          <TablePicker onItemSelect={onItemSelect} />
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
