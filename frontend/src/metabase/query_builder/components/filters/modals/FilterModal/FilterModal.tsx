import React, { useState } from "react";
import { t } from "ttag";
import Question from "metabase-lib/lib/Question";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Button from "metabase/core/components/Button";
import ModalContent from "metabase/components/ModalContent";
import TabContent from "metabase/core/components/TabContent";
import TabList from "metabase/core/components/TabList";
import Tab from "metabase/core/components/Tab";
import TabPanel from "metabase/core/components/TabPanel";

export interface FilterModalProps {
  question: Question;
  onClose?: () => void;
}

const FilterModal = ({
  question,
  onClose,
}: FilterModalProps): JSX.Element | null => {
  const query = question.query();
  if (!(query instanceof StructuredQuery)) {
    return null;
  }

  return (
    <ModalContent
      title={t`Filter`}
      footer={[
        <Button key="cancel" onClick={onClose}>{t`Cancel`}</Button>,
        <Button key="submit" primary onClick={onClose}>{t`Apply`}</Button>,
      ]}
      onClose={onClose}
    >
      <FilterModalBody query={query} />
    </ModalContent>
  );
};

interface FilterModalBodyProps {
  query: StructuredQuery;
}

const FilterModalBody = ({ query }: FilterModalBodyProps): JSX.Element => {
  const [tab, setTab] = useState(0);
  const sections = query.topLevelFilterFieldOptionSections();

  return (
    <TabContent value={tab} onChange={setTab}>
      <TabList>
        {sections.map((section, index) => (
          <Tab key={index} value={index} icon={index > 0 ? "link" : undefined}>
            {section.name}
          </Tab>
        ))}
      </TabList>
      {sections.map((section, index) => (
        <TabPanel key={index} value={index} />
      ))}
    </TabContent>
  );
};

export default FilterModal;
