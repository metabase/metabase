import React, { useCallback, useState } from "react";
import { t } from "ttag";

import TabContent from "metabase/core/components/TabContent";

import type { Card, Collection } from "metabase-types/api";
import type Question from "metabase-lib/Question";
import type Table from "metabase-lib/metadata/Table";

import ModelActionDetails from "./ModelActionDetails";
import ModelDetailHeader from "./ModelDetailHeader";
import ModelInfoSidePanel from "./ModelInfoSidePanel";
import ModelSchemaDetails from "./ModelSchemaDetails";
import ModelUsageDetails from "./ModelUsageDetails";
import {
  RootLayout,
  ModelMain,
  TabList,
  TabPanel,
  NarrowTabPanel,
} from "./ModelDetailPage.styled";

interface Props {
  model: Question;
  mainTable?: Table | null;
  onChangeModel: (model: Card) => void;
  onChangeCollection: (collection: Collection) => void;
}

type ModelTab = "schema" | "usage";

function ModelDetailPage({
  model,
  mainTable,
  onChangeModel,
  onChangeCollection,
}: Props) {
  const [tab, setTab] = useState<ModelTab>("usage");

  const handleNameChange = useCallback(
    name => {
      if (name && name !== model.displayName()) {
        const nextCard = model.setDisplayName(name).card();
        onChangeModel(nextCard as Card);
      }
    },
    [model, onChangeModel],
  );

  const handleDescriptionChange = useCallback(
    description => {
      if (model.description() !== description) {
        const nextCard = model.setDescription(description).card();
        onChangeModel(nextCard as Card);
      }
    },
    [model, onChangeModel],
  );

  return (
    <RootLayout>
      <ModelMain>
        <ModelDetailHeader
          model={model}
          onChangeName={handleNameChange}
          onChangeCollection={onChangeCollection}
        />
        <TabContent value={tab} onChange={setTab}>
          <TabList
            value={tab}
            options={[
              { value: "usage", name: t`Used by` },
              { value: "schema", name: t`Schema` },
              { value: "actions", name: t`Actions` },
            ]}
            onChange={tab => setTab(tab as ModelTab)}
          />
          <TabPanel value="usage">
            <ModelUsageDetails model={model} />
          </TabPanel>
          <TabPanel value="schema">
            <ModelSchemaDetails model={model} />
          </TabPanel>
          <NarrowTabPanel value="actions">
            <ModelActionDetails model={model} />
          </NarrowTabPanel>
        </TabContent>
      </ModelMain>
      <ModelInfoSidePanel
        model={model}
        mainTable={mainTable}
        onChangeDescription={handleDescriptionChange}
      />
    </RootLayout>
  );
}

export default ModelDetailPage;
