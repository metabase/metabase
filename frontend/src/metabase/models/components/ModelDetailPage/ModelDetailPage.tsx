import React from "react";
import { t } from "ttag";

import { TabContent } from "metabase/core/components/TabContent";
import { TabLink } from "metabase/core/components/TabLink";

import * as Urls from "metabase/lib/urls";

import type { Collection } from "metabase-types/api";
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
  TabRow,
  TabPanel,
  TabPanelContent,
} from "./ModelDetailPage.styled";

interface Props {
  model: Question;
  mainTable?: Table | null;
  tab: string;
  hasDataPermissions: boolean;
  hasActionsTab: boolean;
  canRunActions: boolean;
  onChangeName: (name?: string) => void;
  onChangeDescription: (description?: string | null) => void;
  onChangeCollection: (collection: Collection) => void;
}

function ModelDetailPage({
  model,
  tab,
  mainTable,
  hasDataPermissions,
  hasActionsTab,
  canRunActions,
  onChangeName,
  onChangeDescription,
  onChangeCollection,
}: Props) {
  const modelCard = model.card();

  return (
    <RootLayout>
      <ModelMain>
        <ModelDetailHeader
          model={model}
          hasEditDefinitionLink={hasDataPermissions}
          onChangeName={onChangeName}
          onChangeCollection={onChangeCollection}
        />
        <TabContent value={tab}>
          <TabRow>
            <TabLink
              value="usage"
              to={Urls.modelDetail(modelCard, "usage")}
            >{t`Used by`}</TabLink>
            <TabLink
              value="schema"
              to={Urls.modelDetail(modelCard, "schema")}
            >{t`Schema`}</TabLink>
            {hasActionsTab && (
              <TabLink
                value="actions"
                to={Urls.modelDetail(modelCard, "actions")}
              >{t`Actions`}</TabLink>
            )}
          </TabRow>
          <TabPanel value="usage">
            <TabPanelContent>
              <ModelUsageDetails
                model={model}
                hasNewQuestionLink={hasDataPermissions}
              />
            </TabPanelContent>
          </TabPanel>
          <TabPanel value="schema">
            <TabPanelContent>
              <ModelSchemaDetails
                model={model}
                hasEditMetadataLink={hasDataPermissions}
              />
            </TabPanelContent>
          </TabPanel>
          {hasActionsTab && (
            <TabPanel value="actions">
              <TabPanelContent>
                <ModelActionDetails
                  model={model}
                  canRunActions={canRunActions}
                />
              </TabPanelContent>
            </TabPanel>
          )}
        </TabContent>
      </ModelMain>
      <ModelInfoSidePanel
        model={model}
        mainTable={mainTable}
        onChangeDescription={onChangeDescription}
      />
    </RootLayout>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModelDetailPage;
