import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import { Box, Tooltip } from "metabase/ui";

import {
  FieldTitleIcon,
  InfoLink,
  TooltipLabel,
} from "./ExpressionWidgetInfo.styled";

export function ExpressionWidgetInfo() {
  const { url: docsUrl, showMetabaseLinks } = useDocsUrl(
    "questions/query-builder/expressions",
    undefined,
    {
      utm_campaign: "custom-expressions",
    },
  );

  return showMetabaseLinks ? (
    <Tooltip
      label={
        <TooltipLabel>
          {t`You can reference columns here in functions or equations, like: floor([Price] - [Discount]). Click for documentation.`}
        </TooltipLabel>
      }
      position="right"
    >
      <InfoLink
        target="_blank"
        href={docsUrl}
        tabIndex={-1}
        aria-label={t`Open expressions documentation`}
      >
        <FieldTitleIcon name="info" />
      </InfoLink>
    </Tooltip>
  ) : (
    <Tooltip
      label={
        <TooltipLabel>
          {t`You can reference columns here in functions or equations, like: floor([Price] - [Discount]).`}
        </TooltipLabel>
      }
      position="right"
    >
      <Box ml="0.25rem">
        <FieldTitleIcon name="info" />
      </Box>
    </Tooltip>
  );
}
