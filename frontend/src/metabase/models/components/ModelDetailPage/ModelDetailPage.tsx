import { t } from "ttag";

import type Question from "metabase-lib/v1/Question";
import type { CollectionId } from "metabase-types/api";

import ModelActionDetails from "./ModelActionDetails";
import ModelDetailHeader from "./ModelDetailHeader";
import { ModelMain, RootLayout } from "./ModelDetailPage.styled";

interface Props {
  model: Question;
  hasDataPermissions: boolean;
  onChangeName: (name?: string) => void;
  onChangeCollection: ({ id }: { id: CollectionId }) => void;
  shouldShowActionsUI: boolean;
}

function ModelDetailPage({
  model,
  hasDataPermissions,
  shouldShowActionsUI,
  onChangeName,
  onChangeCollection,
}: Props) {
  return (
    <RootLayout>
      <ModelMain>
        <ModelDetailHeader
          model={model}
          hasEditDefinitionLink={hasDataPermissions}
          onChangeName={onChangeName}
          onChangeCollection={onChangeCollection}
        />
        {shouldShowActionsUI ? (
          <ModelActionDetails model={model} />
        ) : (
          <>{t`Actions are not enabled for this model.`}</>
        )}
      </ModelMain>
    </RootLayout>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModelDetailPage;
