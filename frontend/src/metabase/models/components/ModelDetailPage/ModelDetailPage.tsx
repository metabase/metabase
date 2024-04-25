import { t } from "ttag";

import TabContent from "metabase/core/components/TabContent";
import TabLink from "metabase/core/components/TabLink";
import * as Urls from "metabase/lib/urls";
import type Question from "metabase-lib/v1/Question";
import type Table from "metabase-lib/v1/metadata/Table";
import type { CollectionId } from "metabase-types/api";

import ModelActionDetails from "./ModelActionDetails";
import ModelDetailHeader from "./ModelDetailHeader";
import {
  RootLayout,
  ModelMain,
  TabRow,
  TabPanel,
  TabPanelContent,
} from "./ModelDetailPage.styled";
import ModelInfoSidePanel from "./ModelInfoSidePanel";
import ModelSchemaDetails from "./ModelSchemaDetails";
import { ModelUsageDetails } from "./ModelUsageDetails";

interface Props {
  model: Question;
  mainTable?: Table | null;
  tab: string;
  hasDataPermissions: boolean;
  hasActionsTab: boolean;
  hasNestedQueriesEnabled: boolean;
  supportsNestedQueries: boolean;
  onChangeName: (name?: string) => void;
  onChangeDescription: (description?: string | null) => void;
  onChangeCollection: ({ id }: { id: CollectionId }) => void;
}

function ModelDetailPage({
  model,
  tab,
  mainTable,
  hasDataPermissions,
  hasActionsTab,
  hasNestedQueriesEnabled,
  supportsNestedQueries,
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
                hasNewQuestionLink={
                  hasDataPermissions &&
                  supportsNestedQueries &&
                  hasNestedQueriesEnabled
                }
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
                <ModelActionDetails model={model} />
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
