import React, { useState } from "react";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Tab from "metabase/core/components/Tab";
import TabContent from "metabase/core/components/TabContent";
import TabList from "metabase/core/components/TabList";
import TabPanel from "metabase/core/components/TabPanel";

export interface FilterEditorProps {
  query: StructuredQuery;
}

const FilterEditor = ({ query }: FilterEditorProps): JSX.Element => {
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

export default FilterEditor;
