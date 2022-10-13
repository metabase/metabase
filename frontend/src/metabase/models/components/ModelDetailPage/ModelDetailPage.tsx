import React, { useCallback, useState } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import TabContent from "metabase/core/components/TabContent";

import * as Urls from "metabase/lib/urls";

import type { Card } from "metabase-types/api";
import type Question from "metabase-lib/lib/Question";
import type Table from "metabase-lib/lib/metadata/Table";

import ModelActionDetails from "./ModelActionDetails";
import ModelInfoSidePanel from "./ModelInfoSidePanel";
import ModelSchemaDetails from "./ModelSchemaDetails";
import ModelUsageDetails from "./ModelUsageDetails";
import {
  RootLayout,
  ModelMain,
  ModelHeader,
  ModelTitle,
  ModelFootnote,
  TabList,
  TabPanel,
} from "./ModelDetailPage.styled";

interface Props {
  model: Question;
  mainTable?: Table | null;
  onChangeModel: (model: Card) => void;
}

type ModelTab = "schema" | "actions" | "usage";

function ModelDetailPage({ model, mainTable, onChangeModel }: Props) {
  const [tab, setTab] = useState<ModelTab>("usage");

  const modelCard = model.card();

  const exploreDataLink = Urls.question(modelCard);

  const handleNameChange = useCallback(
    name => {
      if (name && name !== model.displayName()) {
        onChangeModel(model.setDisplayName(name).card() as Card);
      }
    },
    [model, onChangeModel],
  );

  const handleChangeDescription = useCallback(
    description => {
      if (model.description() !== description) {
        onChangeModel(model.setDescription(description).card() as Card);
      }
    },
    [model, onChangeModel],
  );

  return (
    <RootLayout>
      <ModelMain>
        <ModelHeader>
          <div>
            <ModelTitle
              initialValue={model.displayName()}
              isDisabled={!model.canWrite()}
              onChange={handleNameChange}
            />
            <ModelFootnote>{t`Model`}</ModelFootnote>
          </div>
          <Button primary as={Link} to={exploreDataLink}>{t`Explore`}</Button>
        </ModelHeader>
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
          <TabPanel value="actions">
            <ModelActionDetails modelId={model.id()} />
          </TabPanel>
        </TabContent>
      </ModelMain>
      <ModelInfoSidePanel
        model={model}
        mainTable={mainTable}
        onChangeDescription={handleChangeDescription}
      />
    </RootLayout>
  );
}

export default ModelDetailPage;
