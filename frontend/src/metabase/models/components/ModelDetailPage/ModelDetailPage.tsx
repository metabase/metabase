import React from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";

import * as Urls from "metabase/lib/urls";

import type Question from "metabase-lib/lib/Question";

import ModelInfoSidePanel from "./ModelInfoSidePanel";
import {
  RootLayout,
  ModelMain,
  ModelHeader,
  ModelTitle,
  ModelFootnote,
} from "./ModelDetailPage.styled";

interface Props {
  model: Question;
}

function ModelDetailPage({ model }: Props) {
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
      </ModelMain>
      <ModelInfoSidePanel model={model} />
    </RootLayout>
  );
}

export default ModelDetailPage;
