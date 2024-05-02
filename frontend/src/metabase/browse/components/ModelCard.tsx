import { t } from "ttag";

import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import type { IconProps } from "metabase/ui";
import { Box, Icon, Text, Title } from "metabase/ui";
import type { Card, SearchResult } from "metabase-types/api";

import { trackModelClick } from "../analytics";
import { getIcon } from "../utils";

import { ModelCardBody, MultilineEllipsified } from "./BrowseModels.styled";

interface ModelCardProps {
  model: Pick<SearchResult, "name" | "id" | "model"> & Partial<SearchResult>;
  icon?: IconProps;
}

export const ModelCard = ({ model, icon }: ModelCardProps) => {
  const headingId = `heading-for-model-${model.id}`;

  icon ??= getIcon(model);

  return (
    <Link
      key={model.id}
      to={Urls.model(model as unknown as Partial<Card>)}
      onClick={() => trackModelClick(model.id)}
    >
      <ModelCardBody>
        <Box mb="auto">
          <Icon {...icon} size={20} color={color("brand")} />
        </Box>
        <Title mb=".25rem" lh="1" size="1rem">
          <MultilineEllipsified tooltipMaxWidth="20rem" id={headingId}>
            {model.name}
          </MultilineEllipsified>
        </Title>
        {model.description?.trim() ? (
          <MultilineEllipsified tooltipMaxWidth="20rem">
            {model.description.replace(/\s+/g, " ")}
          </MultilineEllipsified>
        ) : (
          <Text color="text-light">{t`No description.`}</Text>
        )}
      </ModelCardBody>
    </Link>
  );
};
