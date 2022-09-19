import React, { useState } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import TabContent from "metabase/core/components/TabContent";
import TabPanel from "metabase/core/components/TabPanel";

import * as Urls from "metabase/lib/urls";

import type Question from "metabase-lib/lib/Question";

import ModelInfoSidePanel from "./ModelInfoSidePanel";
import {
  RootLayout,
  ModelMain,
  ModelHeader,
  ModelTitle,
  ModelFootnote,
  TabList,
} from "./ModelDetailPage.styled";

interface Props {
  model: Question;
}

type ModelTab = "schema" | "actions" | "usage";

function ModelDetailPage({ model }: Props) {
  const [tab, setTab] = useState<ModelTab>("schema");

  const modelCard = model.card();

  const exploreDataLink = Urls.question(modelCard);

  return (
    <RootLayout>
      <ModelMain>
        <ModelHeader>
          <div>
            <ModelTitle>{model.displayName()}</ModelTitle>
            <ModelFootnote>{t`Model`}</ModelFootnote>
          </div>
          <Button primary as={Link} to={exploreDataLink}>{t`Explore`}</Button>
        </ModelHeader>
        <TabContent value={tab} onChange={setTab}>
          <TabList
            value={tab}
            options={[
              { value: "schema", name: t`Schema` },
              { value: "actions", name: t`Actions` },
              { value: "usage", name: t`Used by` },
            ]}
            onChange={tab => setTab(tab as ModelTab)}
          />
          <TabPanel value="schema">
            <p>Schema</p>
          </TabPanel>
          <TabPanel value="actions">
            <p>Actions</p>
          </TabPanel>
          <TabPanel value="usage">
            <p>Used by</p>
          </TabPanel>
        </TabContent>
      </ModelMain>
      <ModelInfoSidePanel model={model} />
    </RootLayout>
  );
}

export default ModelDetailPage;
