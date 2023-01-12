import React, { useCallback, useState } from "react";
import { t } from "ttag";

import TabContent from "metabase/core/components/TabContent";

import { checkDatabaseActionsEnabled } from "metabase/actions/utils";

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
  TabPanelContent,
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

  const database = model.database()?.getPlainObject();
  const hasActionsTab = database && checkDatabaseActionsEnabled(database);

  const tabs = [
    { value: "usage", name: t`Used by` },
    { value: "schema", name: t`Schema` },
    hasActionsTab && { value: "actions", name: t`Actions` },
  ].filter(Boolean);

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
            options={tabs}
            onChange={tab => setTab(tab as ModelTab)}
          />
          <TabPanel value="usage">
            <TabPanelContent>
              <ModelUsageDetails model={model} />
            </TabPanelContent>
          </TabPanel>
          <TabPanel value="schema">
            <TabPanelContent>
              <ModelSchemaDetails model={model} />
            </TabPanelContent>
          </TabPanel>
          {hasActionsTab && (
            <TabPanel value="actions">
              <TabPanelContent>
                <ModelActionDetails model={model} />
              </TabPanelContent>
            </TabPanel>
          )}
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
