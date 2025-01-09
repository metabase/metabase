import { t } from "ttag";

import TabContent from "metabase/core/components/TabContent";
import TabLink from "metabase/core/components/TabLink";
import * as Urls from "metabase/lib/urls";
import type Question from "metabase-lib/v1/Question";
import type { CollectionId } from "metabase-types/api";

import ModelActionDetails from "./ModelActionDetails";
import ModelDetailHeader from "./ModelDetailHeader";
import {
  ModelMain,
  RootLayout,
  TabPanel,
  TabPanelContent,
  TabRow,
} from "./ModelDetailPage.styled";
import ModelSchemaDetails from "./ModelSchemaDetails";

interface Props {
  model: Question;
  tab: string;
  hasDataPermissions: boolean;
  hasActionsTab: boolean;
  onChangeName: (name?: string) => void;
  onChangeCollection: ({ id }: { id: CollectionId }) => void;
}

function ModelDetailPage({
  model,
  tab,
  hasDataPermissions,
  hasActionsTab,
  onChangeName,
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
    </RootLayout>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModelDetailPage;
